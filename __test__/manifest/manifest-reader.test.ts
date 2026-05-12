import { describe, it, expect, vi } from 'vitest';
import {
  GitHubManifestReader,
  NullManifestReader
} from '../../src/manifest/manifest-reader.js';
import type { GitHubAggregationApi } from '../../src/domain/types.js';

function makeApi(content: string | null): GitHubAggregationApi {
  return {
    search: { repos: vi.fn() },
    repos: {
      listReleases: vi.fn(),
      getContent: content
        ? vi.fn().mockResolvedValue({
            data: {
              content: Buffer.from(content).toString('base64')
            }
          })
        : vi.fn().mockRejectedValue(new Error('Not found'))
    }
  };
}

describe('GitHubManifestReader', () => {
  it('reads channels from manifest', async () => {
    const yaml = `channels:
  - name: public/standards
    description: Published standards
  - name: members/internal-review
`;
    const api = makeApi(yaml);
    const reader = new GitHubManifestReader(api);

    const channels = await reader.read({ owner: 'o', repo: 'r' });

    expect(channels).toEqual(['public/standards', 'members/internal-review']);
  });

  it('returns null when manifest not found', async () => {
    const api = makeApi(null);
    const reader = new GitHubManifestReader(api);

    const channels = await reader.read({ owner: 'o', repo: 'r' });

    expect(channels).toBeNull();
  });

  it('returns null for malformed manifest', async () => {
    const api = makeApi('not valid yaml: [');
    const reader = new GitHubManifestReader(api);

    const channels = await reader.read({ owner: 'o', repo: 'r' });

    expect(channels).toBeNull();
  });

  it('returns null when manifest has no channels key', async () => {
    const api = makeApi('other_key: value\n');
    const reader = new GitHubManifestReader(api);

    const channels = await reader.read({ owner: 'o', repo: 'r' });

    expect(channels).toBeNull();
  });
});

describe('NullManifestReader', () => {
  it('always returns null', async () => {
    const reader = new NullManifestReader();
    expect(await reader.read({ owner: 'o', repo: 'r' })).toBeNull();
  });
});
