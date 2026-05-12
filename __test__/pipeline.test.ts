import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AggregationPipeline,
  type PipelineDependencies,
} from "../src/pipeline.js";
import { ChannelFilter } from "../src/filtering/channel-filter.js";
import { StageFilter } from "../src/filtering/stage-filter.js";
import { AssetProcessor } from "../src/processing/asset-processor.js";
import { IndexGenerator } from "../src/indexing/index-generator.js";
import type {
  GitHubAggregationApi,
  GitHubRelease,
} from "../src/domain/types.js";
import AdmZip from "adm-zip";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

function makeZipBuffer(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

function makeRelease(
  tag: string,
  options: {
    channels?: string[];
    stage?: string;
    draft?: boolean;
    assets?: string[];
    body?: string;
  } = {},
): GitHubRelease {
  const channelsStr = options.channels
    ? `"channels": ${JSON.stringify(options.channels)}`
    : '"channels": ["public/default"]';
  const stageStr = options.stage
    ? `"stage": "${options.stage}"`
    : '"stage": "published"';

  const body =
    options.body ??
    `content-hash:abc123\n\n<!-- mn-release-metadata\n{"version":1,"id":"${tag.split("/")[0]}","title":"Test ${tag}","edition":"1",${stageStr},"doctype":"standard","revdate":null,"formats":["html"],${channelsStr},"flavor":null,"sourcePath":"sources/test.adoc"}\n-->`;

  const assetNames = options.assets ?? [`${tag.replace("/", "-")}.zip`];
  const assets = assetNames.map((name) => ({
    name,
    browser_download_url: `https://github.com/test/repo/releases/download/${tag}/${name}`,
    size: 1024,
  }));

  return {
    id: Math.random() * 1000,
    tag_name: tag,
    html_url: `https://github.com/test/repo/releases/tag/${tag}`,
    prerelease: false,
    draft: options.draft ?? false,
    body,
    published_at: "2025-01-01T00:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
    assets,
  };
}

describe("AggregationPipeline", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = join(__dirname, "tmp-pipeline-test");
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("happy path: 1 repo, 2 releases, both included", async () => {
    const releases = [
      makeRelease("cc-51015/ed1", { channels: ["public/standards"] }),
      makeRelease("cc-51024/ed1", { channels: ["public/standards"] }),
    ];

    const zipBuffer = makeZipBuffer({ "cc-51015-ed1.html": "<html>" });
    const api = {
      search: { repos: vi.fn() },
      repos: { listReleases: vi.fn().mockResolvedValue({ data: releases }) },
    } as unknown as GitHubAggregationApi;

    // Mock fetch for zip downloads
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(zipBuffer),
    });

    const deps: PipelineDependencies = {
      discoverer: {
        discover: vi.fn().mockResolvedValue([{ owner: "test", repo: "repo" }]),
      },
      channelFilter: new ChannelFilter(undefined),
      stageFilter: new StageFilter(undefined),
      assetProcessor: new AssetProcessor(true),
      indexGenerator: new IndexGenerator(),
      api,
      concurrency: 4,
      includeDrafts: false,
      organizations: ["test"],
      channels: [],
      topic: "metanorma-release",
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, "json");

    expect(result.documents).toHaveLength(2);
    expect(result.repoCount).toBe(1);
    expect(result.channelsFound).toContain("public/standards");

    globalThis.fetch = originalFetch;
  });

  it("filters by channel", async () => {
    const releases = [
      makeRelease("cc-51015/ed1", { channels: ["public/standards"] }),
      makeRelease("cc-51026/ed1", { channels: ["members/internal-review"] }),
    ];

    const zipBuffer = makeZipBuffer({ "doc.html": "x" });
    const api = {
      search: { repos: vi.fn() },
      repos: { listReleases: vi.fn().mockResolvedValue({ data: releases }) },
    } as unknown as GitHubAggregationApi;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(zipBuffer),
    });

    const deps: PipelineDependencies = {
      discoverer: {
        discover: vi.fn().mockResolvedValue([{ owner: "test", repo: "repo" }]),
      },
      channelFilter: new ChannelFilter(["public/standards"]),
      stageFilter: new StageFilter(undefined),
      assetProcessor: new AssetProcessor(true),
      indexGenerator: new IndexGenerator(),
      api,
      concurrency: 4,
      includeDrafts: false,
      organizations: ["test"],
      channels: ["public/standards"],
      topic: "metanorma-release",
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, "json");

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe("cc-51015");

    globalThis.fetch = originalFetch;
  });

  it("skips draft releases when includeDrafts=false", async () => {
    const releases = [
      makeRelease("cc-51015/ed1", { draft: false }),
      makeRelease("cc-51026/ed2-wd", { draft: true }),
    ];

    const zipBuffer = makeZipBuffer({ "doc.html": "x" });
    const api = {
      search: { repos: vi.fn() },
      repos: { listReleases: vi.fn().mockResolvedValue({ data: releases }) },
    } as unknown as GitHubAggregationApi;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(zipBuffer),
    });

    const deps: PipelineDependencies = {
      discoverer: {
        discover: vi.fn().mockResolvedValue([{ owner: "test", repo: "repo" }]),
      },
      channelFilter: new ChannelFilter(undefined),
      stageFilter: new StageFilter(undefined),
      assetProcessor: new AssetProcessor(true),
      indexGenerator: new IndexGenerator(),
      api,
      concurrency: 4,
      includeDrafts: false,
      organizations: ["test"],
      channels: [],
      topic: "metanorma-release",
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, "json");

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe("cc-51015");

    globalThis.fetch = originalFetch;
  });

  it("includes legacy releases without metadata", async () => {
    const releases = [
      makeRelease("cc-legacy/v1", {
        body: "Just a plain release body\nno metadata here",
      }),
    ];

    const zipBuffer = makeZipBuffer({ "doc.html": "x" });
    const api = {
      search: { repos: vi.fn() },
      repos: { listReleases: vi.fn().mockResolvedValue({ data: releases }) },
    } as unknown as GitHubAggregationApi;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(zipBuffer),
    });

    const deps: PipelineDependencies = {
      discoverer: {
        discover: vi.fn().mockResolvedValue([{ owner: "test", repo: "repo" }]),
      },
      channelFilter: new ChannelFilter(["public/standards"]),
      stageFilter: new StageFilter(undefined),
      assetProcessor: new AssetProcessor(true),
      indexGenerator: new IndexGenerator(),
      api,
      concurrency: 4,
      includeDrafts: false,
      organizations: ["test"],
      channels: ["public/standards"],
      topic: "metanorma-release",
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, "json");

    // Legacy releases are always included regardless of channel filter
    expect(result.documents).toHaveLength(1);

    globalThis.fetch = originalFetch;
  });

  it("handles repo with no releases gracefully", async () => {
    const api = {
      search: { repos: vi.fn() },
      repos: { listReleases: vi.fn().mockResolvedValue({ data: [] }) },
    } as unknown as GitHubAggregationApi;

    const deps: PipelineDependencies = {
      discoverer: {
        discover: vi.fn().mockResolvedValue([{ owner: "test", repo: "repo" }]),
      },
      channelFilter: new ChannelFilter(undefined),
      stageFilter: new StageFilter(undefined),
      assetProcessor: new AssetProcessor(true),
      indexGenerator: new IndexGenerator(),
      api,
      concurrency: 4,
      includeDrafts: false,
      organizations: ["test"],
      channels: [],
      topic: "metanorma-release",
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, "json");

    expect(result.documents).toHaveLength(0);
    expect(result.repoCount).toBe(1);
  });

  it("handles empty discovery result", async () => {
    const api = {
      search: { repos: vi.fn() },
      repos: { listReleases: vi.fn() },
    } as unknown as GitHubAggregationApi;

    const deps: PipelineDependencies = {
      discoverer: { discover: vi.fn().mockResolvedValue([]) },
      channelFilter: new ChannelFilter(undefined),
      stageFilter: new StageFilter(undefined),
      assetProcessor: new AssetProcessor(true),
      indexGenerator: new IndexGenerator(),
      api,
      concurrency: 4,
      includeDrafts: false,
      organizations: [],
      channels: [],
      topic: "metanorma-release",
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, "json");

    expect(result.documents).toHaveLength(0);
    expect(result.repoCount).toBe(0);
    expect(api.repos.listReleases).not.toHaveBeenCalled();
  });

  it("reports per-repo statistics", async () => {
    const releases = [
      makeRelease("cc-1/ed1", { channels: ["public/standards"] }),
      makeRelease("cc-2/ed1", { channels: ["members/internal"] }),
    ];

    const zipBuffer = makeZipBuffer({ "doc.html": "x" });
    const api = {
      search: { repos: vi.fn() },
      repos: { listReleases: vi.fn().mockResolvedValue({ data: releases }) },
    } as unknown as GitHubAggregationApi;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(zipBuffer),
    });

    const deps: PipelineDependencies = {
      discoverer: {
        discover: vi.fn().mockResolvedValue([{ owner: "test", repo: "repo" }]),
      },
      channelFilter: new ChannelFilter(["public/standards"]),
      stageFilter: new StageFilter(undefined),
      assetProcessor: new AssetProcessor(true),
      indexGenerator: new IndexGenerator(),
      api,
      concurrency: 4,
      includeDrafts: false,
      organizations: ["test"],
      channels: ["public/standards"],
      topic: "metanorma-release",
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, "json");

    const report = result.report["test/repo"];
    expect(report.releases).toBe(2);
    expect(report.included).toBe(1);
    expect(report.skipped).toBe(1);

    globalThis.fetch = originalFetch;
  });
});
