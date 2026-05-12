# 03: Content-Hash Deduplication

> **Status: TODO**
> **Priority**: Performance optimization
> **Depends on**: None
> **Reference**: Spec 12 §4

## Problem

Releases that haven't changed since the last aggregation run are still
downloaded, extracted, and written to disk. For large document sets this is
wasteful.

## Design

Use the `content-hash:{hex}` on the first line of the release body to skip
unchanged releases. Cache hashes between runs using `actions/cache`.

```typescript
const hashLine = release.body?.split('\n')[0] ?? '';
const cachedHash = await hashCache.get(`${repo.owner}/${repo.repo}/${release.tag_name}`);

if (hashLine && hashLine === cachedHash) {
  log.info(`Skipping ${release.tag_name}: content unchanged`);
  skipped++;
  continue;
}

// ... process release ...

if (hashLine) {
  await hashCache.set(`${repo.owner}/${repo.repo}/${release.tag_name}`, hashLine);
}
```

```yaml
- uses: actions/cache@v4
  with:
    path: .cache/content-hashes
    key: mn-aggregate-hashes-${{ github.run_id }}
    restore-keys: mn-aggregate-hashes-
```

## Acceptance criteria

- Content hashes cached per `{owner}/{repo}/{tag}` key
- Unchanged releases skipped (no download, no extraction)
- Cache survives between CI runs
- Fallback: missing cache or hash-less releases still processed
