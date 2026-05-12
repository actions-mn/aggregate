import { describe, it, expect } from 'vitest';
import { ExplicitRepoDiscoverer } from '../../src/discovery/explicit-discoverer.js';

describe('ExplicitRepoDiscoverer', () => {
  it('parses owner/repo strings', async () => {
    const discoverer = new ExplicitRepoDiscoverer([
      'actions-mn/release',
      'actions-mn/aggregate'
    ]);
    const repos = await discoverer.discover();

    expect(repos).toHaveLength(2);
    expect(repos[0]).toEqual({ owner: 'actions-mn', repo: 'release' });
    expect(repos[1]).toEqual({ owner: 'actions-mn', repo: 'aggregate' });
  });

  it('handles single repo', async () => {
    const discoverer = new ExplicitRepoDiscoverer(['my-org/my-repo']);
    const repos = await discoverer.discover();

    expect(repos).toHaveLength(1);
    expect(repos[0]).toEqual({ owner: 'my-org', repo: 'my-repo' });
  });

  it('handles empty list', async () => {
    const discoverer = new ExplicitRepoDiscoverer([]);
    const repos = await discoverer.discover();

    expect(repos).toHaveLength(0);
  });

  it('rejects missing slash', async () => {
    const discoverer = new ExplicitRepoDiscoverer(['invalid']);
    await expect(discoverer.discover()).rejects.toThrow('Invalid repo format');
  });

  it('rejects leading slash', async () => {
    const discoverer = new ExplicitRepoDiscoverer(['/repo']);
    await expect(discoverer.discover()).rejects.toThrow('Invalid repo format');
  });

  it('rejects trailing slash', async () => {
    const discoverer = new ExplicitRepoDiscoverer(['owner/']);
    await expect(discoverer.discover()).rejects.toThrow('Invalid repo format');
  });
});
