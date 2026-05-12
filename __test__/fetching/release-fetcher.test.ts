import { describe, it, expect, vi } from 'vitest';
import { PaginatedReleaseFetcher } from '../../src/fetching/release-fetcher.js';
import type {
  GitHubAggregationApi,
  GitHubRelease
} from '../../src/domain/types.js';

function makeApi(
  pages: GitHubRelease[][],
  statuses?: number[]
): GitHubAggregationApi {
  let callIndex = 0;
  return {
    search: { repos: vi.fn() },
    repos: {
      listReleases: vi.fn().mockImplementation(() => {
        const idx = callIndex++;
        return Promise.resolve({
          status: statuses?.[idx] ?? 200,
          data: pages[idx] ?? [],
          headers: idx === 0 ? { etag: '"etag-val"' } : {}
        });
      }),
      getContent: vi.fn()
    }
  };
}

describe('PaginatedReleaseFetcher', () => {
  it('fetches single page of releases', async () => {
    const releases = [
      { tag_name: 'v1' },
      { tag_name: 'v2' }
    ] as GitHubRelease[];
    const api = makeApi([releases]);
    const fetcher = new PaginatedReleaseFetcher(api);

    const result = await fetcher.fetch({ owner: 'o', repo: 'r' });

    expect(result.releases).toHaveLength(2);
    expect(result.etag).toBe('"etag-val"');
    expect(result.unchanged).toBe(false);
  });

  it('paginates when first page is full', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      tag_name: `v${i}`
    })) as GitHubRelease[];
    const page2 = [{ tag_name: 'v100' }] as GitHubRelease[];
    const api = makeApi([page1, page2]);
    const fetcher = new PaginatedReleaseFetcher(api);

    const result = await fetcher.fetch({ owner: 'o', repo: 'r' });

    expect(result.releases).toHaveLength(101);
    expect(api.repos.listReleases).toHaveBeenCalledTimes(2);
  });

  it('returns unchanged when 304 response', async () => {
    const api = makeApi([[]], [304]);
    const fetcher = new PaginatedReleaseFetcher(api);

    const result = await fetcher.fetch({ owner: 'o', repo: 'r' }, '"old-etag"');

    expect(result.unchanged).toBe(true);
    expect(result.releases).toHaveLength(0);
    expect(result.etag).toBe('"old-etag"');
  });

  it('sends If-None-Match header when etag provided', async () => {
    const api = makeApi([[]]);
    const fetcher = new PaginatedReleaseFetcher(api);

    await fetcher.fetch({ owner: 'o', repo: 'r' }, '"my-etag"');

    expect(api.repos.listReleases).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'If-None-Match': '"my-etag"' }
      })
    );
  });
});
