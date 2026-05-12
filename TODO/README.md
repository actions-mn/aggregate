# TODO

Planned improvements for `actions-mn/aggregate`.

## Priority order

| # | File | Description | Priority |
|---|---|---|---|
| 01 | [etag-caching.md](01-etag-caching.md) | Cache release listing ETags to skip unchanged repos | Performance |
| 02 | [repo-channel-manifest.md](02-repo-channel-manifest.md) | Read `.metanorma/channels.yml` for early repo filtering | Optimization |
| 03 | [content-hash-dedup.md](03-content-hash-dedup.md) | Skip re-downloading releases with unchanged content hashes | Performance |
| 04 | [pagination.md](04-pagination.md) | Fetch all release pages (not just first 100) | Robustness |
| 05 | [custom-file-routing.md](05-custom-file-routing.md) | Configurable output directory structure (flat/by-doctype/by-format) | Enhancement |
| 06 | [partial-failure.md](06-partial-failure.md) | Structured error reporting with `fail-on-error` option | Observability |
| 07 | [delta-aggregation.md](07-delta-aggregation.md) | Incremental aggregation — only process changed releases | Enhancement |

## Completed

The following were implemented as part of the initial release (v1.0.0):

- Channel-based release filtering (`ChannelFilter`, `StageFilter`)
- Topic-based and explicit repo discovery
- Zip asset download, extraction, and filename canonicalization
- JSON and JSONL index generation
- Bounded concurrency with `mapWithConcurrency`
- Backward compatibility with legacy (pre-metadata) releases
- Per-repo aggregation statistics in report output
