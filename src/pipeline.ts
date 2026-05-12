import type {
  RepoRef,
  GitHubRelease,
  AggregatedDocument,
  AggregationResult,
  RepoReport,
  RepoError,
  AggregationParameters,
  ReleaseMetadataJson,
  IRepoDiscoverer,
  IReleaseFetcher,
  IManifestReader,
  ICacheStore
} from './domain/types.js';
import { parseReleaseMetadata, extractContentHash } from './domain/types.js';
import type { ChannelFilter } from './filtering/channel-filter.js';
import type { StageFilter } from './filtering/stage-filter.js';
import type { AssetProcessor } from './processing/asset-processor.js';
import type { IndexGenerator } from './indexing/index-generator.js';
import type { PipelineConfig } from './domain/types.js';
import type { DeltaStateManager } from './delta/state-manager.js';
import { logger } from './shared/logger.js';
import { mapWithConcurrency } from './shared/concurrency.js';

export interface PipelineDependencies {
  readonly discoverer: IRepoDiscoverer;
  readonly releaseFetcher: IReleaseFetcher;
  readonly manifestReader: IManifestReader;
  readonly channelFilter: ChannelFilter;
  readonly stageFilter: StageFilter;
  readonly assetProcessor: AssetProcessor;
  readonly indexGenerator: IndexGenerator;
  readonly deltaManager: DeltaStateManager;
  readonly etagCache: ICacheStore;
  readonly config: PipelineConfig;
}

interface RepoResult {
  readonly documents: AggregatedDocument[];
  readonly channelsFound: string[];
  readonly report: RepoReport;
  readonly etag: string | null;
  readonly processedTags: string[];
  readonly failed: boolean;
}

export class AggregationPipeline {
  private readonly deps: PipelineDependencies;

  constructor(deps: PipelineDependencies) {
    this.deps = deps;
  }

  async run(
    outputDir: string,
    format: 'json' | 'jsonl'
  ): Promise<AggregationResult> {
    await this.deps.deltaManager.load();

    // 1. Discover repos
    logger.info('Discovering repositories...');
    const repos = await this.deps.discoverer.discover();
    logger.info(`Found ${repos.length} repositories`);

    if (repos.length === 0) {
      logger.info('No repositories found — nothing to aggregate.');
      return {
        documents: [],
        repoCount: 0,
        channelsFound: [],
        report: {},
        failedRepos: []
      };
    }

    // 2. Process repos in parallel
    const repoResults = await mapWithConcurrency(
      repos,
      this.deps.config.concurrency,
      async (repo) => this.processRepo(repo, outputDir)
    );

    // 3. Collect results
    const documents: AggregatedDocument[] = [];
    const allChannels = new Set<string>();
    const report: Record<string, RepoReport> = {};
    const failedRepos: string[] = [];

    for (let i = 0; i < repoResults.length; i++) {
      const r = repoResults[i];
      const repo = repos[i];
      const key = `${repo.owner}/${repo.repo}`;

      if (r.status === 'rejected') {
        const reason =
          r.reason instanceof Error ? r.reason.message : String(r.reason);
        logger.error(`FAILED: ${key}: ${reason}`);
        report[key] = {
          releases: 0,
          included: 0,
          skipped: 0,
          reason: `error: ${reason}`,
          errors: [{ tag: '', message: reason }]
        };
        failedRepos.push(key);
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
      if (result.failed) {
        failedRepos.push(key);
      }
    }

    // 4. Generate index
    const parameters: AggregationParameters = {
      organizations: this.deps.config.organizations,
      channels: this.deps.config.channels,
      topic: this.deps.config.topic,
      repoCount: repos.length
    };

    const indexPath = await this.deps.indexGenerator.generate(
      documents,
      outputDir,
      format,
      parameters
    );

    await this.deps.deltaManager.save();

    logger.info(
      `Done. Aggregated ${documents.length} documents from ${repos.length} repos. ` +
        `Index: ${indexPath}`
    );

    return {
      documents,
      repoCount: repos.length,
      channelsFound: [...allChannels].sort(),
      report,
      failedRepos
    };
  }

  private async processRepo(
    repo: RepoRef,
    outputDir: string
  ): Promise<RepoResult> {
    const key = `${repo.owner}/${repo.repo}`;
    const log = logger.scoped(key);

    // 1. Check channel manifest — skip repo if no channel overlap
    const manifestChannels = await this.deps.manifestReader.read(repo);
    if (
      manifestChannels !== null &&
      !this.deps.channelFilter.overlaps(manifestChannels)
    ) {
      log.info('Skipping: no matching channels in manifest');
      return {
        documents: [],
        channelsFound: [],
        report: {
          releases: 0,
          included: 0,
          skipped: 0,
          reason: 'skipped: channel manifest'
        },
        etag: null,
        processedTags: [],
        failed: false
      };
    }

    // 2. Fetch releases with ETag + pagination
    const cachedEtag = (await this.deps.etagCache.get(`etag:${key}`)) ?? null;
    const fetchResult = await this.deps.releaseFetcher.fetch(
      repo,
      cachedEtag ?? undefined
    );

    if (fetchResult.unchanged) {
      log.info('Skipping: ETag unchanged');
      return {
        documents: [],
        channelsFound: [],
        report: {
          releases: 0,
          included: 0,
          skipped: 0,
          reason: 'skipped: etag unchanged'
        },
        etag: cachedEtag,
        processedTags: [],
        failed: false
      };
    }

    // Cache the new ETag
    if (fetchResult.etag) {
      await this.deps.etagCache.set(`etag:${key}`, fetchResult.etag);
    }
    if (this.deps.deltaManager) {
      this.deps.deltaManager.setEtag(key, fetchResult.etag);
    }

    // 3. Process each release
    const documents: AggregatedDocument[] = [];
    const channelsFound: string[] = [];
    const errors: RepoError[] = [];
    const processedTags: string[] = [];
    let included = 0;
    let skipped = 0;

    for (const release of fetchResult.releases) {
      if (!this.deps.config.includeDrafts && release.draft) {
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

      const zipAsset = release.assets.find((a) => a.name.endsWith('.zip'));
      if (!zipAsset) {
        skipped++;
        continue;
      }

      // Content-hash dedup check
      const contentHash = extractContentHash(release.body);
      if (
        this.deps.deltaManager.isReleaseProcessed(
          key,
          release.tag_name,
          contentHash
        )
      ) {
        log.info(`Skipping ${release.tag_name}: content unchanged`);
        skipped++;

        // Re-use previously processed files from delta state
        const prevFiles = this.deps.deltaManager.getReleaseFiles(
          key,
          release.tag_name
        );
        if (prevFiles.length > 0 && metadata) {
          documents.push(
            this.buildDocument(
              metadata,
              prevFiles.map((f) => ({ name: f, path: f })),
              contentHash,
              release,
              repo
            )
          );
        }
        processedTags.push(release.tag_name);
        continue;
      }

      try {
        const zipBuffer = await this.downloadAsset(
          zipAsset.browser_download_url
        );
        const result = await this.deps.assetProcessor.process(
          zipBuffer,
          outputDir,
          metadata
        );

        documents.push(
          this.buildDocument(metadata, result.files, contentHash, release, repo)
        );
        for (const ch of result.channels) {
          channelsFound.push(ch);
        }

        processedTags.push(release.tag_name);
        this.deps.deltaManager.markReleaseProcessed(
          key,
          release.tag_name,
          contentHash,
          result.files.map((f) => f.path)
        );
        included++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.warn(`Failed to process release ${release.tag_name}: ${msg}`);
        errors.push({ tag: release.tag_name, message: msg });
        skipped++;
      }
    }

    // Cleanup stale files from releases no longer matching
    await this.deps.deltaManager.cleanupStaleFiles(key, processedTags);

    log.info(`${included} included, ${skipped} skipped`);

    const hasErrors = errors.length > 0;
    return {
      documents,
      channelsFound,
      report: {
        releases: fetchResult.releases.length,
        included,
        skipped,
        reason: hasErrors
          ? `${errors.length} release(s) failed`
          : skipped > 0
            ? 'filtered by channel/stage or no zip asset'
            : 'all included',
        errors: hasErrors ? errors : undefined
      },
      etag: fetchResult.etag,
      processedTags,
      failed: hasErrors
    };
  }

  private buildDocument(
    metadata: ReleaseMetadataJson | null,
    files: readonly { name: string; path: string }[],
    contentHash: string | null,
    release: GitHubRelease,
    repo: RepoRef
  ): AggregatedDocument {
    return {
      id: metadata?.id ?? this.extractIdFromTag(release.tag_name),
      title: metadata?.title ?? release.tag_name,
      edition: metadata?.edition ?? '',
      stage: metadata?.stage ?? 'published',
      doctype: metadata?.doctype ?? 'standard',
      channels: metadata?.channels ?? [],
      formats: metadata?.formats ?? this.inferFormats(files),
      flavor: metadata?.flavor ?? null,
      contentHash,
      source: {
        owner: repo.owner,
        repo: repo.repo,
        tag: release.tag_name,
        releaseUrl: release.html_url,
        releaseDate: release.published_at ?? release.created_at
      },
      files
    };
  }

  private extractIdFromTag(tag: string): string {
    const slashIndex = tag.indexOf('/');
    return slashIndex === -1 ? tag : tag.slice(0, slashIndex);
  }

  private inferFormats(files: readonly { name: string }[]): string[] {
    return files
      .map((f) => {
        const dot = f.name.lastIndexOf('.');
        return dot === -1 ? '' : f.name.slice(dot + 1).toLowerCase();
      })
      .filter((ext) => ext && ext !== 'rxl');
  }

  private async downloadAsset(url: string): Promise<Buffer> {
    const response = await fetch(url, {
      headers: { Accept: 'application/octet-stream' }
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download asset: ${response.status} ${response.statusText}`
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
