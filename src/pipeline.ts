import type { GitHubAggregationApi, IRepoDiscoverer } from "./domain/types.js";
import type {
  RepoRef,
  GitHubRelease,
  AggregatedDocument,
  AggregationResult,
  RepoReport,
  AggregationParameters,
  ReleaseMetadataJson,
} from "./domain/types.js";
import { parseReleaseMetadata, extractContentHash } from "./domain/types.js";
import type { ChannelFilter } from "./filtering/channel-filter.js";
import type { StageFilter } from "./filtering/stage-filter.js";
import type { AssetProcessor } from "./processing/asset-processor.js";
import type { IndexGenerator } from "./indexing/index-generator.js";
import { logger } from "./shared/logger.js";
import { mapWithConcurrency } from "./shared/concurrency.js";

export interface PipelineDependencies {
  readonly discoverer: IRepoDiscoverer;
  readonly channelFilter: ChannelFilter;
  readonly stageFilter: StageFilter;
  readonly assetProcessor: AssetProcessor;
  readonly indexGenerator: IndexGenerator;
  readonly api: GitHubAggregationApi;
  readonly concurrency: number;
  readonly includeDrafts: boolean;
  readonly organizations: readonly string[];
  readonly channels: readonly string[];
  readonly topic: string;
}

interface RepoResult {
  readonly documents: AggregatedDocument[];
  readonly channelsFound: string[];
  readonly report: RepoReport;
}

export class AggregationPipeline {
  private readonly deps: PipelineDependencies;

  constructor(deps: PipelineDependencies) {
    this.deps = deps;
  }

  async run(
    outputDir: string,
    format: "json" | "jsonl",
  ): Promise<AggregationResult> {
    // 1. Discover repos
    logger.info("Discovering repositories...");
    const repos = await this.deps.discoverer.discover();
    logger.info(`Found ${repos.length} repositories`);

    if (repos.length === 0) {
      logger.info("No repositories found — nothing to aggregate.");
      return { documents: [], repoCount: 0, channelsFound: [], report: {} };
    }

    // 2. Process repos in parallel
    const repoResults = await mapWithConcurrency(
      repos,
      this.deps.concurrency,
      async (repo) => this.processRepo(repo, outputDir),
    );

    // 3. Collect results
    const documents: AggregatedDocument[] = [];
    const allChannels = new Set<string>();
    const report: Record<string, RepoReport> = {};

    for (let i = 0; i < repoResults.length; i++) {
      const r = repoResults[i];
      const repo = repos[i];
      const key = `${repo.owner}/${repo.repo}`;

      if (r.status === "rejected") {
        const reason =
          r.reason instanceof Error ? r.reason.message : String(r.reason);
        logger.error(`FAILED: ${key}: ${reason}`);
        report[key] = {
          releases: 0,
          included: 0,
          skipped: 0,
          reason: `error: ${reason}`,
        };
        continue;
      }

      const result = r.value;
      for (const doc of result.documents) {
        documents.push(doc);
      }
      for (const ch of result.channelsFound) {
        allChannels.add(ch);
      }
      report[key] = result.report;
    }

    // 4. Generate index
    const parameters: AggregationParameters = {
      organizations: this.deps.organizations,
      channels: this.deps.channels,
      topic: this.deps.topic,
      repoCount: repos.length,
    };

    const indexPath = await this.deps.indexGenerator.generate(
      documents,
      outputDir,
      format,
      parameters,
    );

    logger.info(
      `Done. Aggregated ${documents.length} documents from ${repos.length} repos. ` +
        `Index: ${indexPath}`,
    );

    return {
      documents,
      repoCount: repos.length,
      channelsFound: [...allChannels].sort(),
      report,
    };
  }

  private async processRepo(
    repo: RepoRef,
    outputDir: string,
  ): Promise<RepoResult> {
    const key = `${repo.owner}/${repo.repo}`;
    const log = logger.scoped(key);
    log.info("Processing repo");

    let releases: GitHubRelease[];
    try {
      const result = await this.deps.api.repos.listReleases({
        owner: repo.owner,
        repo: repo.repo,
        per_page: 100,
      });
      releases = result.data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.warn(`Failed to list releases: ${msg}`);
      return {
        documents: [],
        channelsFound: [],
        report: {
          releases: 0,
          included: 0,
          skipped: 0,
          reason: `API error: ${msg}`,
        },
      };
    }

    const documents: AggregatedDocument[] = [];
    const channelsFound: string[] = [];
    let included = 0;
    let skipped = 0;

    for (const release of releases) {
      if (!this.deps.includeDrafts && release.draft) {
        skipped++;
        continue;
      }

      const metadata = parseReleaseMetadata(release.body);

      if (!this.deps.channelFilter.matches(metadata)) {
        skipped++;
        continue;
      }

      if (!this.deps.stageFilter.matches(metadata)) {
        skipped++;
        continue;
      }

      const zipAsset = release.assets.find((a) => a.name.endsWith(".zip"));
      if (!zipAsset) {
        skipped++;
        continue;
      }

      try {
        const zipBuffer = await this.downloadAsset(
          zipAsset.browser_download_url,
        );
        const result = await this.deps.assetProcessor.process(
          zipBuffer,
          outputDir,
          metadata,
        );

        const contentHash = extractContentHash(release.body);
        documents.push(
          this.buildDocument(
            metadata,
            result.files,
            contentHash,
            release,
            repo,
          ),
        );
        for (const ch of result.channels) {
          channelsFound.push(ch);
        }
        included++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.warn(`Failed to process release ${release.tag_name}: ${msg}`);
        skipped++;
      }
    }

    log.info(`${included} included, ${skipped} skipped`);

    return {
      documents,
      channelsFound,
      report: {
        releases: releases.length,
        included,
        skipped,
        reason:
          skipped > 0
            ? "filtered by channel/stage or no zip asset"
            : "all included",
      },
    };
  }

  private buildDocument(
    metadata: ReleaseMetadataJson | null,
    files: readonly { name: string; path: string }[],
    contentHash: string | null,
    release: GitHubRelease,
    repo: RepoRef,
  ): AggregatedDocument {
    return {
      id: metadata?.id ?? this.extractIdFromTag(release.tag_name),
      title: metadata?.title ?? release.tag_name,
      edition: metadata?.edition ?? "",
      stage: metadata?.stage ?? "published",
      doctype: metadata?.doctype ?? "standard",
      channels: metadata?.channels ?? [],
      formats: metadata?.formats ?? this.inferFormats(files),
      flavor: metadata?.flavor ?? null,
      contentHash,
      source: {
        owner: repo.owner,
        repo: repo.repo,
        tag: release.tag_name,
        releaseUrl: release.html_url,
        releaseDate: release.published_at ?? release.created_at,
      },
      files,
    };
  }

  private extractIdFromTag(tag: string): string {
    const slashIndex = tag.indexOf("/");
    return slashIndex === -1 ? tag : tag.slice(0, slashIndex);
  }

  private inferFormats(files: readonly { name: string }[]): string[] {
    return files
      .map((f) => {
        const dot = f.name.lastIndexOf(".");
        return dot === -1 ? "" : f.name.slice(dot + 1).toLowerCase();
      })
      .filter((ext) => ext && ext !== "rxl");
  }

  private async downloadAsset(url: string): Promise<Buffer> {
    const response = await fetch(url, {
      headers: { Accept: "application/octet-stream" },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download asset: ${response.status} ${response.statusText}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
