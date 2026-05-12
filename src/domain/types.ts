import type { FileRoutingMode } from '../processing/asset-processor.js';

// ─── Discovery ──────────────────────────────────────────────────────────────

export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

export interface IRepoDiscoverer {
  discover(): Promise<readonly RepoRef[]>;
}

// ─── Release metadata (parsed from release body) ────────────────────────────

export interface ReleaseMetadataJson {
  readonly version: 1;
  readonly id: string;
  readonly title: string;
  readonly edition: string;
  readonly stage: string;
  readonly doctype: string;
  readonly revdate: string | null;
  readonly formats: readonly string[];
  readonly channels: readonly string[];
  readonly flavor: string | null;
  readonly sourcePath: string;
}

// ─── Aggregated document ────────────────────────────────────────────────────

export interface DocumentFile {
  readonly name: string;
  readonly path: string;
}

export interface DocumentSource {
  readonly owner: string;
  readonly repo: string;
  readonly tag: string;
  readonly releaseUrl: string;
  readonly releaseDate: string;
}

export interface AggregatedDocument {
  readonly id: string;
  readonly title: string;
  readonly edition: string;
  readonly stage: string;
  readonly doctype: string;
  readonly channels: readonly string[];
  readonly formats: readonly string[];
  readonly flavor: string | null;
  readonly contentHash: string | null;
  readonly source: DocumentSource;
  readonly files: readonly DocumentFile[];
}

// ─── Repo-level report ──────────────────────────────────────────────────────

export interface RepoError {
  readonly tag: string;
  readonly message: string;
}

export interface RepoReport {
  readonly releases: number;
  readonly included: number;
  readonly skipped: number;
  readonly reason: string;
  readonly errors?: readonly RepoError[];
}

// ─── Aggregation result ─────────────────────────────────────────────────────

export interface AggregationResult {
  readonly documents: readonly AggregatedDocument[];
  readonly repoCount: number;
  readonly channelsFound: readonly string[];
  readonly report: Readonly<Record<string, RepoReport>>;
  readonly failedRepos: readonly string[];
}

// ─── Index output ───────────────────────────────────────────────────────────

export interface AggregationParameters {
  readonly organizations: readonly string[];
  readonly channels: readonly string[];
  readonly topic: string;
  readonly repoCount: number;
}

export interface DocumentIndex {
  readonly version: 1;
  readonly generatedAt: string;
  readonly parameters: AggregationParameters;
  readonly summary: {
    readonly repoCount: number;
    readonly documentCount: number;
    readonly channelsFound: readonly string[];
  };
  readonly documents: readonly AggregatedDocument[];
}

// ─── Release fetching ───────────────────────────────────────────────────────

export interface FetchResult {
  readonly releases: readonly GitHubRelease[];
  readonly etag: string | null;
  readonly unchanged: boolean;
}

export interface IReleaseFetcher {
  fetch(repo: RepoRef, etag?: string | null): Promise<FetchResult>;
}

// ─── Channel manifest ───────────────────────────────────────────────────────

export interface IManifestReader {
  read(repo: RepoRef): Promise<readonly string[] | null>;
}

// ─── Caching ────────────────────────────────────────────────────────────────

export interface ICacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// ─── Delta aggregation state ────────────────────────────────────────────────

export interface ReleaseState {
  readonly contentHash: string | null;
  readonly files: readonly string[];
}

export interface RepoState {
  etag: string | null;
  releases: Record<string, ReleaseState>;
}

export interface AggregationState {
  lastRun: string;
  repos: Record<string, RepoState>;
}

// ─── GitHub API protocol ────────────────────────────────────────────────────

export interface GitHubSearchResult {
  readonly items: readonly {
    readonly owner: { readonly login: string };
    readonly name: string;
  }[];
}

export interface GitHubReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
  readonly size: number;
}

export interface GitHubRelease {
  readonly id: number;
  readonly tag_name: string;
  readonly html_url: string;
  readonly prerelease: boolean;
  readonly draft: boolean;
  readonly body: string | null;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly assets: readonly GitHubReleaseAsset[];
}

export interface GitHubAggregationApi {
  search: {
    repos(params: {
      q: string;
      per_page: number;
    }): Promise<{ data: GitHubSearchResult }>;
  };
  repos: {
    listReleases(params: {
      owner: string;
      repo: string;
      per_page: number;
      page?: number;
      headers?: Record<string, string>;
    }): Promise<{
      status: number;
      data: GitHubRelease[];
      headers: Record<string, string>;
    }>;
    getContent(params: {
      owner: string;
      repo: string;
      path: string;
    }): Promise<{ data: { content: string } }>;
  };
}

// ─── Pipeline config ────────────────────────────────────────────────────────

export interface PipelineConfig {
  readonly organizations: readonly string[];
  readonly channels: readonly string[];
  readonly topic: string;
  readonly concurrency: number;
  readonly includeDrafts: boolean;
  readonly failOnError: boolean;
  readonly fileRouting: FileRoutingMode;
}

// ─── Release metadata parsing ───────────────────────────────────────────────

export function parseReleaseMetadata(
  body: string | null | undefined
): ReleaseMetadataJson | null {
  if (!body) return null;
  const match = body.match(/<!-- mn-release-metadata\n([\s\S]*?)\n-->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as ReleaseMetadataJson;
  } catch {
    return null;
  }
}

export function extractContentHash(
  body: string | null | undefined
): string | null {
  if (!body) return null;
  const match = body.match(/^content-hash:([a-f0-9]+)/m);
  return match ? match[1] : null;
}
