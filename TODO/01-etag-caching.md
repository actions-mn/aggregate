# 01: ETag Caching for Release Listings

> **Status: TODO**
> **Priority**: Performance optimization
> **Depends on**: None

## Problem

Every aggregation run fetches all releases from every repo, even if nothing
changed. For orgs with many repos, this wastes API rate limit (5000 req/hr)
and adds latency.

## Design

Use `actions/cache` to persist ETags per repo between runs. When GitHub returns
`304 Not Modified`, skip re-downloading and re-processing that repo's releases.

```yaml
- uses: actions/cache@v4
  with:
    path: .cache/etags
    key: mn-aggregate-etags-${{ github.run_id }}
    restore-keys: mn-aggregate-etags-
```

```typescript
// In pipeline.ts
const cachedEtag = await etagCache.get(repoKey);
const response = await api.repos.listReleases({
  owner, repo, per_page: 100,
  headers: cachedEtag ? { 'If-None-Match': cachedEtag } : undefined,
});
if (response.status === 304) {
  // No changes — skip this repo
  continue;
}
await etagCache.set(repoKey, response.headers.etag);
```

## Acceptance criteria

- ETags cached per `owner/repo` key
- `304 Not Modified` responses skip repo processing
- Cache survives between CI runs
- Fallback: missing or stale cache doesn't break aggregation
