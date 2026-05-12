import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AggregationPipeline,
  type PipelineDependencies
} from '../src/pipeline.js';
import { ChannelFilter } from '../src/filtering/channel-filter.js';
import { StageFilter } from '../src/filtering/stage-filter.js';
import { AssetProcessor } from '../src/processing/asset-processor.js';
import { IndexGenerator } from '../src/indexing/index-generator.js';
import { NullDeltaManager } from '../src/delta/state-manager.js';
import { NullCacheStore } from '../src/caching/cache-store.js';
import type { GitHubRelease, FetchResult } from '../src/domain/types.js';
import AdmZip from 'adm-zip';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';

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
  } = {}
): GitHubRelease {
  const channelsStr = options.channels
    ? `"channels": ${JSON.stringify(options.channels)}`
    : '"channels": ["public/default"]';
  const stageStr = options.stage
    ? `"stage": "${options.stage}"`
    : '"stage": "published"';

  const body =
    options.body ??
    `content-hash:abc123\n\n<!-- mn-release-metadata\n{"version":1,"id":"${tag.split('/')[0]}","title":"Test ${tag}","edition":"1",${stageStr},"doctype":"standard","revdate":null,"formats":["html"],${channelsStr},"flavor":null,"sourcePath":"sources/test.adoc"}\n-->`;

  const assetNames = options.assets ?? [`${tag.replace('/', '-')}.zip`];
  const assets = assetNames.map((name) => ({
    name,
    browser_download_url: `https://github.com/test/repo/releases/download/${tag}/${name}`,
    size: 1024
  }));

  return {
    id: Math.random() * 1000,
    tag_name: tag,
    html_url: `https://github.com/test/repo/releases/tag/${tag}`,
    prerelease: false,
    draft: options.draft ?? false,
    body,
    published_at: '2025-01-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    assets
  };
}

function mockFetchResult(
  releases: GitHubRelease[]
): () => Promise<FetchResult> {
  return vi.fn().mockResolvedValue({
    releases,
    etag: null,
    unchanged: false
  });
}

function makeDeps(
  overrides: Partial<{
    releases: GitHubRelease[];
    channels: string[] | undefined;
    discoverRepos: { owner: string; repo: string }[];
  }> = {}
): PipelineDependencies {
  const releases = overrides.releases ?? [];
  const channels = overrides.channels ?? undefined;
  const discoverRepos = overrides.discoverRepos ?? [
    { owner: 'test', repo: 'repo' }
  ];

  return {
    discoverer: {
      discover: vi.fn().mockResolvedValue(discoverRepos)
    },
    releaseFetcher: {
      fetch: mockFetchResult(releases)
    },
    manifestReader: {
      read: vi.fn().mockResolvedValue(null)
    },
    channelFilter: new ChannelFilter(channels),
    stageFilter: new StageFilter(undefined),
    assetProcessor: new AssetProcessor(true),
    indexGenerator: new IndexGenerator(),
    deltaManager: new NullDeltaManager(),
    etagCache: new NullCacheStore(),
    config: {
      organizations: ['test'],
      channels: channels ?? [],
      topic: 'metanorma-release',
      concurrency: 4,
      includeDrafts: false,
      failOnError: false,
      fileRouting: 'flat' as const
    }
  };
}

function mockFetch(zipBuffer: Buffer) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(zipBuffer)
  });
  return originalFetch;
}

describe('AggregationPipeline', () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = join(__dirname, 'tmp-pipeline-test');
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('happy path: 1 repo, 2 releases, both included', async () => {
    const releases = [
      makeRelease('cc-51015/ed1', { channels: ['public/standards'] }),
      makeRelease('cc-51024/ed1', { channels: ['public/standards'] })
    ];
    const zipBuffer = makeZipBuffer({ 'cc-51015-ed1.html': '<html>' });
    const originalFetch = mockFetch(zipBuffer);

    const deps = makeDeps({ releases });
    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(2);
    expect(result.repoCount).toBe(1);
    expect(result.channelsFound).toContain('public/standards');

    globalThis.fetch = originalFetch;
  });

  it('filters by channel', async () => {
    const releases = [
      makeRelease('cc-51015/ed1', { channels: ['public/standards'] }),
      makeRelease('cc-51026/ed1', { channels: ['members/internal-review'] })
    ];
    const zipBuffer = makeZipBuffer({ 'doc.html': 'x' });
    const originalFetch = mockFetch(zipBuffer);

    const deps = makeDeps({ releases, channels: ['public/standards'] });
    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('cc-51015');

    globalThis.fetch = originalFetch;
  });

  it('skips draft releases when includeDrafts=false', async () => {
    const releases = [
      makeRelease('cc-51015/ed1', { draft: false }),
      makeRelease('cc-51026/ed2-wd', { draft: true })
    ];
    const zipBuffer = makeZipBuffer({ 'doc.html': 'x' });
    const originalFetch = mockFetch(zipBuffer);

    const deps = makeDeps({ releases });
    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('cc-51015');

    globalThis.fetch = originalFetch;
  });

  it('includes legacy releases without metadata', async () => {
    const releases = [
      makeRelease('cc-legacy/v1', {
        body: 'Just a plain release body\nno metadata here'
      })
    ];
    const zipBuffer = makeZipBuffer({ 'doc.html': 'x' });
    const originalFetch = mockFetch(zipBuffer);

    const deps = makeDeps({ releases, channels: ['public/standards'] });
    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(1);

    globalThis.fetch = originalFetch;
  });

  it('handles repo with no releases gracefully', async () => {
    const deps = makeDeps({ releases: [] });
    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(0);
    expect(result.repoCount).toBe(1);
  });

  it('handles empty discovery result', async () => {
    const deps = makeDeps({ releases: [], discoverRepos: [] });
    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(0);
    expect(result.repoCount).toBe(0);
  });

  it('reports per-repo statistics', async () => {
    const releases = [
      makeRelease('cc-1/ed1', { channels: ['public/standards'] }),
      makeRelease('cc-2/ed1', { channels: ['members/internal'] })
    ];
    const zipBuffer = makeZipBuffer({ 'doc.html': 'x' });
    const originalFetch = mockFetch(zipBuffer);

    const deps = makeDeps({ releases, channels: ['public/standards'] });
    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    const report = result.report['test/repo'];
    expect(report.releases).toBe(2);
    expect(report.included).toBe(1);
    expect(report.skipped).toBe(1);

    globalThis.fetch = originalFetch;
  });

  it('skips repo when manifest has no matching channels', async () => {
    const releases = [makeRelease('cc-1/ed1')];
    const zipBuffer = makeZipBuffer({ 'doc.html': 'x' });
    const originalFetch = mockFetch(zipBuffer);

    const deps = makeDeps({
      releases,
      channels: ['public/standards']
    });
    deps.manifestReader = {
      read: vi.fn().mockResolvedValue(['members/internal'])
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(0);
    expect(result.report['test/repo'].reason).toBe('skipped: channel manifest');

    globalThis.fetch = originalFetch;
  });

  it('skips repo when ETag unchanged', async () => {
    const deps = makeDeps({ releases: [] });
    deps.releaseFetcher = {
      fetch: vi.fn().mockResolvedValue({
        releases: [],
        etag: null,
        unchanged: true
      })
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(0);
    expect(result.report['test/repo'].reason).toBe('skipped: etag unchanged');
  });

  it('collects errors and reports failed repos', async () => {
    const releases = [
      makeRelease('cc-1/ed1', { channels: ['public/standards'] })
    ];
    const deps = makeDeps({ releases, channels: ['public/standards'] });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(0);
    expect(result.failedRepos).toContain('test/repo');
    expect(result.report['test/repo'].errors).toHaveLength(1);
    expect(result.report['test/repo'].errors![0].tag).toBe('cc-1/ed1');

    globalThis.fetch = originalFetch;
  });

  it('skips release when content hash unchanged', async () => {
    const releases = [
      makeRelease('cc-1/ed1', { channels: ['public/standards'] })
    ];
    const deps = makeDeps({ releases, channels: ['public/standards'] });
    deps.deltaManager = {
      load: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      getEtag: vi.fn().mockReturnValue(null),
      setEtag: vi.fn(),
      isReleaseProcessed: vi.fn().mockReturnValue(true),
      getReleaseFiles: vi.fn().mockReturnValue(['cc-1.html']),
      markReleaseProcessed: vi.fn(),
      cleanupStaleFiles: vi.fn().mockResolvedValue(0)
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(tmpDir, 'json');

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].files[0].path).toBe('cc-1.html');
  });
});
