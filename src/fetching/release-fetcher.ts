import type {
  GitHubAggregationApi,
  IReleaseFetcher,
  FetchResult,
  RepoRef
} from '../domain/types.js';
import { logger } from '../shared/logger.js';

export class PaginatedReleaseFetcher implements IReleaseFetcher {
  constructor(private readonly api: GitHubAggregationApi) {}

  async fetch(repo: RepoRef, etag?: string | null): Promise<FetchResult> {
    const requestHeaders: Record<string, string> = {};
    if (etag) {
      requestHeaders['If-None-Match'] = etag;
    }

    const firstPage = await this.api.repos.listReleases({
      owner: repo.owner,
      repo: repo.repo,
      per_page: 100,
      headers: requestHeaders
    });

    if (firstPage.status === 304) {
      logger.scoped(`${repo.owner}/${repo.repo}`).info('ETag unchanged');
      return { releases: [], etag: etag ?? null, unchanged: true };
    }

    const allReleases = [...firstPage.data];
    const responseEtag = firstPage.headers.etag ?? null;

    if (firstPage.data.length === 100) {
      let page = 2;
      while (true) {
        const result = await this.api.repos.listReleases({
          owner: repo.owner,
          repo: repo.repo,
          per_page: 100,
          page
        });
        allReleases.push(...result.data);
        if (result.data.length < 100) break;
        page++;
      }
    }

    return { releases: allReleases, etag: responseEtag, unchanged: false };
  }
}
