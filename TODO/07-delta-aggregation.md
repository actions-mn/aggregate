# 07: Delta Aggregation

> **Status: TODO**
> **Priority**: Future enhancement
> **Depends on**: 01 (ETag caching), 03 (content-hash dedup)

## Problem

Every aggregation run re-downloads and re-extracts all matching releases. For
large orgs with hundreds of standards, this is slow. Ideally, only changed
releases are processed.

## Design

Support incremental aggregation by persisting the last-run state:

```yaml
- uses: actions/cache@v4
  with:
    path: .cache/aggregate-state
    key: mn-aggregate-state-${{ github.run_id }}
    restore-keys: mn-aggregate-state-
```

The state file tracks:

```json
{
  "lastRun": "2025-05-12T06:00:00Z",
  "repos": {
    "CalConnect/cc-standards": {
      "etag": "\"abc123\"",
      "releases": {
        "cc-51015/ed1": { "contentHash": "content-hash:sha256:...", "files": ["cc-51015.pdf"] }
      }
    }
  }
}
```

On subsequent runs:

1. Load cached state
2. Fetch releases with ETag (skip if 304)
3. Compare content hashes (skip unchanged)
4. Delete files from releases no longer matching filters
5. Add/update files from new or changed releases
6. Regenerate index
7. Save updated state

## Acceptance criteria

- Incremental mode only processes changed releases
- Stale files from removed/filtered releases are cleaned up
- Index reflects current state (not accumulated)
- Full mode available as fallback (`force-full: true`)
