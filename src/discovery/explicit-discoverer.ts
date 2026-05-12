import type { IRepoDiscoverer, RepoRef } from '../domain/types.js';

export class ExplicitRepoDiscoverer implements IRepoDiscoverer {
  constructor(private readonly repos: readonly string[]) {}

  async discover(): Promise<readonly RepoRef[]> {
    return this.repos.map((r) => {
      const slashIndex = r.indexOf('/');
      if (
        slashIndex === -1 ||
        slashIndex === 0 ||
        slashIndex === r.length - 1
      ) {
        throw new Error(`Invalid repo format: "${r}". Expected "owner/repo".`);
      }
      return {
        owner: r.slice(0, slashIndex),
        repo: r.slice(slashIndex + 1)
      };
    });
  }
}
