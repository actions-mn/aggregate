import type {
  GitHubAggregationApi,
  IRepoDiscoverer,
  RepoRef
} from '../domain/types.js';
import { logger } from '../shared/logger.js';

export class TopicRepoDiscoverer implements IRepoDiscoverer {
  constructor(
    private readonly api: GitHubAggregationApi,
    private readonly organizations: readonly string[],
    private readonly topic: string
  ) {}

  async discover(): Promise<readonly RepoRef[]> {
    if (this.organizations.length === 0) {
      logger.warn(
        'No organizations specified and no explicit repos — nothing to discover'
      );
      return [];
    }

    const repos: RepoRef[] = [];
    for (const org of this.organizations) {
      const query = `topic:${this.topic} org:${org}`;
      logger.info(`Discovering repos: ${query}`);

      const result = await this.api.search.repos({
        q: query,
        per_page: 100
      });

      for (const item of result.data.items) {
        repos.push({ owner: item.owner.login, repo: item.name });
      }
      logger.info(`Found ${result.data.items.length} repos in ${org}`);
    }

    return repos;
  }
}
