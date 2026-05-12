import { describe, it, expect, vi } from 'vitest';
import { TopicRepoDiscoverer } from '../../src/discovery/topic-discoverer.js';
import type { GitHubAggregationApi } from '../../src/domain/types.js';

function mockApi(
  repos: Array<{ owner: string; repo: string }>
): GitHubAggregationApi {
  return {
    search: {
      repos: vi.fn().mockResolvedValue({
        data: {
          items: repos.map((r) => ({
            owner: { login: r.owner },
            name: r.repo
          }))
        }
      })
    },
    repos: {
      listReleases: vi.fn()
    }
  };
}

describe('TopicRepoDiscoverer', () => {
  it('discovers repos by topic across one org', async () => {
    const api = mockApi([
      { owner: 'CalConnect', repo: 'cc-standards' },
      { owner: 'CalConnect', repo: 'cc-reports' }
    ]);
    const discoverer = new TopicRepoDiscoverer(
      api,
      ['CalConnect'],
      'metanorma-release'
    );
    const repos = await discoverer.discover();

    expect(repos).toHaveLength(2);
    expect(api.search.repos).toHaveBeenCalledWith({
      q: 'topic:metanorma-release org:CalConnect',
      per_page: 100
    });
  });

  it('discovers repos across multiple orgs', async () => {
    const api = mockApi([{ owner: 'OrgA', repo: 'repo-a' }]);
    const discoverer = new TopicRepoDiscoverer(
      api,
      ['OrgA', 'OrgB'],
      'metanorma-release'
    );
    const repos = await discoverer.discover();

    expect(api.search.repos).toHaveBeenCalledTimes(2);
  });

  it('returns empty when no organizations', async () => {
    const api = mockApi([]);
    const discoverer = new TopicRepoDiscoverer(api, [], 'metanorma-release');
    const repos = await discoverer.discover();

    expect(repos).toHaveLength(0);
    expect(api.search.repos).not.toHaveBeenCalled();
  });
});
