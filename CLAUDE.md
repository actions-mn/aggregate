# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`actions-mn/aggregate` is a GitHub Action that aggregates released Metanorma documents from GitHub repositories with channel-based filtering. It is the downstream consumer of [`actions-mn/release`](https://github.com/actions-mn/release).

**Role**: This action does **not** compile or publish — it discovers already-released documents, filters by channel/stage, downloads zip assets, extracts files, canonicalizes filenames, and generates a structured JSON index. Portals (like standards.calconnect.org) use this action to aggregate documents for their sites.

## Build Commands

```bash
npm run build          # TypeScript check + esbuild bundle → dist/index.js
npm run format         # Prettier format all .ts files
npm run format-check   # Check formatting without writing
npm run lint           # ESLint (src/ only)
npm test               # Vitest
npm run test:coverage  # Vitest with coverage report
```

## Tech Stack

- TypeScript, targeting ES2024 / Node 24
- esbuild for bundling
- vitest for testing (80% coverage threshold)
- ESLint 9 flat config
- `@actions/core`, `@octokit/rest`, `adm-zip`, `js-yaml`

## Architecture

### Pipeline

```
Discover → Check Manifest → Fetch → Parse → Filter → Dedup → Download → Extract → Index → Delta Save
(repo)     (channels.yml)   (ETag)  (meta)  (ch/st)  (hash)  (zip)     (files)  (JSON)  (state)
```

Each stage is an interface with a default implementation. `main.ts` is the composition root — it constructs all dependencies and injects them into `AggregationPipeline`.

### Key Source Directories

```
src/
├── domain/          Types and interfaces
│   └── types.ts     All domain types, pipeline interfaces (IRepoDiscoverer, IReleaseFetcher, etc.)
├── discovery/       Repo discovery strategies
│   ├── topic-discoverer.ts      Search by GitHub topic across organizations
│   └── explicit-discoverer.ts   Parse explicit owner/repo list
├── fetching/        Release fetching with pagination + ETag
│   └── release-fetcher.ts       PaginatedReleaseFetcher — fetches all pages, handles 304
├── manifest/        Channel manifest reading
│   └── manifest-reader.ts       GitHubManifestReader — reads .metanorma/channels.yml
├── filtering/       Release filtering
│   ├── channel-filter.ts        Filter by channel (with overlaps() for manifest check)
│   └── stage-filter.ts          Filter by publication stage
├── caching/         Persistent cache (backed by actions/cache)
│   └── cache-store.ts           FileCacheStore + NullCacheStore
├── processing/      Asset processing with file routing
│   └── asset-processor.ts       Extract zip, canonicalize filenames, route to subdirs
├── indexing/        Index generation
│   └── index-generator.ts       JSON and JSONL document index
├── delta/           Delta aggregation state
│   └── state-manager.ts         DeltaStateManager — content-hash dedup, stale file cleanup
├── shared/          Utilities
│   ├── logger.ts                PrefixLogger with scoped() for per-repo context
│   └── concurrency.ts           mapWithConcurrency for bounded parallelism
├── main.ts          Entry point / composition root
├── input-helper.ts  Action input parsing
└── pipeline.ts      AggregationPipeline orchestrator
```

### Pipeline Interfaces

- `IRepoDiscoverer` — discover repos (topic search or explicit list)
- `IReleaseFetcher` — fetch all releases with pagination and ETag support
- `IManifestReader` — read `.metanorma/channels.yml` for early repo filtering
- `ICacheStore` — key-value cache for ETags and delta state
- `ChannelFilter` — filter releases by configured channels (with `overlaps()` for manifest)
- `StageFilter` — filter releases by configured stages
- `AssetProcessor` — download, extract, canonicalize, and route zip contents
- `IndexGenerator` — produce JSON/JSONL document index
- `DeltaStateManager` — content-hash dedup, stale file cleanup, state persistence

### Caching Architecture

When `cache-dir` is set, the action uses a `FileCacheStore` (persisted via `actions/cache`) for:
- **ETags**: Skip repos whose releases haven't changed (HTTP 304)
- **Content hashes**: Skip re-downloading releases with unchanged content
- **Delta state**: Track processed releases per repo, clean up stale files

Null implementations (`NullCacheStore`, `NullManifestReader`, `NullDeltaManager`) are used when caching is disabled.

### File Routing

`AssetProcessor` supports three output structures via `file-routing` input:
- `flat` (default): all files in `output-dir/`
- `by-doctype`: `{output-dir}/{doctype}/` subdirectories
- `by-format`: `{output-dir}/{ext}/` subdirectories

### Release Metadata Protocol

Releases from `actions-mn/release` contain metadata in an HTML comment:

```markdown
content-hash:abc123...

<!-- mn-release-metadata
{"version":1,"id":"cc-51015","channels":["public/standards"],...}
-->

## Document Title
...
```

Parsing: extract JSON between `<!-- mn-release-metadata\n` and `\n-->`. Legacy releases without this metadata are always included for backward compatibility.

### Filename Canonicalization

Strip edition suffixes using regex `/-ed\d+(\.\d+)?(-[a-z0-9]+)?\./`:
- `cc-51015-ed1.pdf` → `cc-51015.pdf`
- `cc-51015-ed2-wd.html` → `cc-51015.html`

### Index Format

```json
{
  "version": 1,
  "generatedAt": "2025-05-12T06:00:00Z",
  "parameters": { "organizations": ["CalConnect"], "channels": ["public/standards"], "topic": "metanorma-release" },
  "summary": { "repoCount": 5, "documentCount": 42, "channelsFound": ["public/standards"] },
  "documents": [ { "id": "cc-51015", "title": "...", "channels": ["public/standards"], "files": [...] } ]
}
```

### Error Reporting

- `aggregation-report` output includes per-release error details (`errors` array in `RepoReport`)
- `failed-repos` output lists repos that had processing errors
- `fail-on-error: true` fails the action when any repo has errors

## Conventions

- Immutable value objects (readonly props, no setters)
- Pipeline stages communicate via domain types
- All repo/release failures are caught and reported — individual failures don't stop aggregation
- Per-repo statistics in `aggregation-report` output
- Logger prefix: `[mn-aggregate]`
- Content hash on first line of release body for change detection
- Channels use hierarchical `audience/category` format (e.g., `public/standards`)
- Test helper factories (`makeDeps`, `makeRelease`, `mockFetch`) for DRY test setup
- `vi.fn()` for all mocks, `vi.clearAllMocks()` in `beforeEach`
- Real temp directories in tests, cleaned up in `afterEach`
