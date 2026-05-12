# 04: Paginated Release Fetching

> **Status: TODO**
> **Priority**: Robustness
> **Depends on**: None

## Problem

The current implementation fetches only the first page of releases (`per_page:
100`). Repos with more than 100 releases will miss older ones.

## Design

Implement paginated fetching using Octokit's auto-pagination or manual page
iteration.

```typescript
async fetchAllReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
  const allReleases: GitHubRelease[] = [];
  let page = 1;

  while (true) {
    const result = await api.repos.listReleases({
      owner, repo,
      per_page: 100,
      page,
    });
    allReleases.push(...result.data);
    if (result.data.length < 100) break;
    page++;
  }

  return allReleases;
}
```

Or use Octokit's built-in pagination:

```typescript
const releases = await api.paginate(api.repos.listReleases, {
  owner, repo, per_page: 100,
});
```

## Acceptance criteria

- All releases fetched, not just first 100
- Graceful handling of API rate limits (429 responses)
- Works with repos that have < 100 or > 100 releases
