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
npm run lint           # ESLint
npm test               # Vitest
npm run test:coverage  # Vitest with coverage report
```

## Tech Stack

- TypeScript, targeting ES2024 / Node 24
- esbuild for bundling
- vitest for testing (80% coverage threshold)
- ESLint 9 flat config
- `@actions/core`, `@octokit/rest`, `adm-zip`

## Architecture

### Pipeline

```
Discover → Fetch → Parse → Filter → Download → Extract → Index
(repo)     (releases) (metadata) (channel/  (zip)     (files)  (JSON/
                                     stage)                       JSONL)
```

Each stage is an interface with a default implementation. `main.ts` is the composition root — it constructs all dependencies and injects them into `AggregationPipeline`.

### Key Source Directories

```
src/
├── domain/          Types and interfaces
│   └── types.ts     ReleaseMetadataJson, AggregatedDocument, IRepoDiscoverer, etc.
├── discovery/       Repo discovery strategies
│   ├── topic-discoverer.ts      Search by GitHub topic across organizations
│   └── explicit-discoverer.ts   Parse explicit owner/repo list
├── filtering/       Release filtering
│   ├── channel-filter.ts        Filter by channel (audience/category)
│   └── stage-filter.ts          Filter by publication stage
├── processing/      Asset processing
│   └── asset-processor.ts       Download zip, extract, canonicalize filenames
├── indexing/        Index generation
│   └── index-generator.ts       JSON and JSONL document index
├── shared/          Utilities
│   ├── logger.ts                PrefixLogger with scoped() for per-repo context
│   └── concurrency.ts           mapWithConcurrency for bounded parallelism
├── main.ts          Entry point / composition root
├── input-helper.ts  Action input parsing
└── pipeline.ts      AggregationPipeline orchestrator
```

### Pipeline Interfaces

- `IRepoDiscoverer` — discover repos (topic search or explicit list)
- `ChannelFilter` — filter releases by configured channels
- `StageFilter` — filter releases by configured stages
- `AssetProcessor` — download, extract, and canonicalize zip contents
- `IndexGenerator` — produce JSON/JSONL document index

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

## Conventions

- Immutable value objects (readonly props, no setters)
- Pipeline stages communicate via domain types
- All repo/release failures are caught and reported — individual failures don't stop aggregation
- Per-repo statistics in `aggregation-report` output
- Logger prefix: `[mn-aggregate]`
- Content hash on first line of release body for change detection
- Channels use hierarchical `audience/category` format (e.g., `public/standards`)
