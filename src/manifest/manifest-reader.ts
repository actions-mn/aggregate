import { load as yamlLoad } from 'js-yaml';
import type {
  GitHubAggregationApi,
  IManifestReader,
  RepoRef
} from '../domain/types.js';

interface ChannelsYaml {
  channels?: { name: string }[];
}

export class GitHubManifestReader implements IManifestReader {
  constructor(private readonly api: GitHubAggregationApi) {}

  async read(repo: RepoRef): Promise<readonly string[] | null> {
    try {
      const { data } = await this.api.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path: '.metanorma/channels.yml'
      });
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const parsed = yamlLoad(content) as ChannelsYaml | null;
      if (!parsed?.channels) return null;
      return parsed.channels.map((c) => c.name);
    } catch {
      return null;
    }
  }
}

export class NullManifestReader implements IManifestReader {
  async read(): Promise<null> {
    return null;
  }
}
