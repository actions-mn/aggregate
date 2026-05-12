import { unlink } from 'fs/promises';
import { join } from 'path';
import type { AggregationState, ICacheStore } from '../domain/types.js';
import { logger } from '../shared/logger.js';

export class DeltaStateManager {
  private state: AggregationState = { lastRun: '', repos: {} };

  constructor(
    private readonly cache: ICacheStore,
    private readonly outputDir: string
  ) {}

  async load(): Promise<void> {
    const raw = await this.cache.get('delta-state');
    if (raw) {
      try {
        this.state = JSON.parse(raw);
      } catch {
        this.state = { lastRun: '', repos: {} };
      }
    }
  }

  async save(): Promise<void> {
    this.state.lastRun = new Date().toISOString();
    await this.cache.set('delta-state', JSON.stringify(this.state));
  }

  getEtag(repoKey: string): string | null {
    return this.state.repos[repoKey]?.etag ?? null;
  }

  setEtag(repoKey: string, etag: string | null): void {
    if (!this.state.repos[repoKey]) {
      this.state.repos[repoKey] = { etag: null, releases: {} };
    }
    this.state.repos[repoKey].etag = etag;
  }

  isReleaseProcessed(
    repoKey: string,
    tag: string,
    contentHash: string | null
  ): boolean {
    if (!contentHash) return false;
    return (
      this.state.repos[repoKey]?.releases[tag]?.contentHash === contentHash
    );
  }

  getReleaseFiles(repoKey: string, tag: string): readonly string[] {
    return this.state.repos[repoKey]?.releases[tag]?.files ?? [];
  }

  markReleaseProcessed(
    repoKey: string,
    tag: string,
    contentHash: string | null,
    files: readonly string[]
  ): void {
    if (!this.state.repos[repoKey]) {
      this.state.repos[repoKey] = { etag: null, releases: {} };
    }
    this.state.repos[repoKey].releases[tag] = {
      contentHash,
      files: [...files]
    };
  }

  async cleanupStaleFiles(
    repoKey: string,
    currentTags: readonly string[]
  ): Promise<number> {
    const repoState = this.state.repos[repoKey];
    if (!repoState) return 0;

    let removed = 0;
    for (const tag of Object.keys(repoState.releases)) {
      if (!currentTags.includes(tag)) {
        for (const file of repoState.releases[tag].files) {
          try {
            await unlink(join(this.outputDir, file));
            removed++;
          } catch {
            // file already gone
          }
        }
        delete repoState.releases[tag];
      }
    }
    if (removed > 0) {
      logger.scoped(repoKey).info(`Cleaned up ${removed} stale files`);
    }
    return removed;
  }
}

export class NullDeltaManager extends DeltaStateManager {
  constructor() {
    super(
      {
        get: async () => null,
        set: async () => {},
        delete: async () => {}
      },
      ''
    );
  }

  override async load(): Promise<void> {}

  override async save(): Promise<void> {}

  override isReleaseProcessed(): boolean {
    return false;
  }

  override async cleanupStaleFiles(): Promise<number> {
    return 0;
  }
}
