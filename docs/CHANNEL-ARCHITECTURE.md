# Channel-Based Publication Architecture

This document describes the channel architecture for the `actions-mn` ecosystem.
It is intended for **repo maintainers** (who write `metanorma.release.yml`) and
**portal maintainers** (who configure `actions-mn/aggregate`).

## Overview

Channels control which documents appear on which portal. They flow through three
layers:

```
metanorma.release.yml     actions-mn/release          actions-mn/aggregate
(per-repo manifest)  ──►  (publishes releases)  ──►  (aggregates to portal)
       │                        │                          │
  "cc-s-* goes to         Release body contains        Portal filters by
   public/standards"       mn-release-metadata JSON     requested channels
```

## How channels work

### 1. Publisher side: `metanorma.release.yml`

Each repo declares which channels its documents publish to using pattern matching
on document IDs. The manifest lives in the repo root alongside `metanorma.yml`.

```yaml
# metanorma.release.yml
#
# Documents matching a pattern are released to the specified channel.
# Documents NOT matching any pattern are NOT released (safe by default).

documents:
  - pattern: "cc-s-*"
    channels: [public/standards]

  - pattern: "cc-r-*"
    channels: [public/reports]
```

**Safety guarantees:**

- **No `defaults` section** → unmatched documents default to **private** (never released)
- **`default-visibility: private`** in the workflow → extra safety net when no manifest exists
- **`stages: [published]`** (optional) → blocks drafts from being released at all
- **Explicit pattern + channel** → no document is released without a deliberate declaration

### 2. Release format

The release action embeds channel metadata in each GitHub Release body:

```markdown
content-hash:abc123...

<!-- mn-release-metadata
{"version":1,"id":"cc-s-51015","channels":["public/standards"],...}
-->

## CC/A 51015
...
```

### 3. Aggregator side: `actions-mn/aggregate`

Portals declare which channels they want. The aggregator filters accordingly.

```yaml
- uses: actions-mn/aggregate@v0
  with:
    organizations: CalConnect
    channels: 'public/standards,public/reports'
    output-dir: _site/cc
```

**Backward compatibility:** Releases without `mn-release-metadata` (from older
`actions-mn/release` versions) are always included. These legacy releases have no
channel data and pass through all filters.

## Channel vocabulary

### Format

Channels use `audience/category` format:

```
public/standards
members/internal-review
internal/working-draft
```

- **audience**: `public`, `members`, or `internal` — determines access scope
- **category**: free-form — determines routing within a portal

### CalConnect channel registry

| Channel | Audience | Document IDs | Description |
|---|---|---|---|
| `public/standards` | Public | `cc-s-*` | Published CalConnect Standards |
| `public/reports` | Public | `cc-r-*` | Conference, roundtable, IOP test reports |
| `public/admin` | Public | `cc-a-*` | Administrative documents |
| `public/advisories` | Public | `cc-adv-*` | Advisories |
| `public/directives` | Public | `cc-dir-*` | CalConnect directives |
| `members/draft` | Members | — | Documents under member review |
| `internal/working` | Internal | — | Internal working documents (never aggregated) |

### Adding a new channel

1. Choose `audience/category` — audience determines access, category determines purpose
2. Add a pattern entry in the repo's `metanorma.release.yml`
3. Add the channel to the aggregation portal's `channels` input
4. No code changes needed — channels are purely declarative

## Repo-level channel manifest

Optional file `.metanorma/channels.yml` declares a repo's channels for efficient
discovery. The aggregator reads this to skip repos with no channel overlap:

```yaml
# .metanorma/channels.yml
channels:
  - name: public/standards
    description: "Published CalConnect Standards"
  - name: public/reports
    description: "Conference, roundtable, and IOP test reports"
```

## Safety model

The system has three defense layers against document leaks:

### Layer 1: Manifest pattern matching (publisher)

```
No pattern match → NOT released (no GitHub Release created)
Pattern match + stages: [published] → only published docs released
Pattern match + visibility: private → explicitly blocked
```

This is the strongest guarantee. If a document doesn't match a manifest entry,
the release action never creates a GitHub Release for it. No metadata is
published. No download URL exists.

### Layer 2: Channel assignment (publisher)

```
Channel is determined by manifest entry (pattern → channels)
Cannot be overridden by the aggregation site
```

The publisher decides the channel. The aggregator can only filter — it cannot
reassign channels or discover documents that the publisher didn't release.

### Layer 3: Aggregation filtering (consumer)

```
Aggregator requests specific channels → only matching releases included
Aggregator requests specific stages → only matching stages included
Legacy releases (no metadata) → always included
```

The portal controls its own view. Even if a release exists on GitHub, the
portal won't display it unless the channel and stage match.

### Why "no defaults" is critical

When a manifest file exists but has no `defaults` section:

```yaml
# Safe: no defaults
documents:
  - pattern: "cc-s-*"
    channels: [public/standards]
```

Unmatched documents → `effectiveVisibility = private` → **not released**.

```yaml
# DANGEROUS: defaults.visibility: public
defaults:
  visibility: public
documents:
  - pattern: "cc-s-*"
    channels: [public/standards]
```

Unmatched documents → `defaultVisibility = public` → **released to
`public/default`**. A new document with an unexpected ID would be publicly
released without a deliberate channel assignment.

**Rule: Never set `defaults.visibility: public` in production manifests.**

## Manifest templates

### Standards repository (cc-admin-documents)

```yaml
# metanorma.release.yml
#
# Pattern-based channel assignment for CalConnect administrative documents.
# Documents not matching any pattern are NOT released.
# Only published stage documents are released.

documents:
  # ── Standards ────────────────────────────────────────────────
  - pattern: "cc-s-*"
    channels: [public/standards]

  # ── Reports ──────────────────────────────────────────────────
  - pattern: "cc-r-*"
    channels: [public/reports]

  # ── Administrative documents ─────────────────────────────────
  - pattern: "cc-a-*"
    channels: [public/admin]

  # ── Advisories ───────────────────────────────────────────────
  - pattern: "cc-adv-*"
    channels: [public/advisories]
```

### Directive repository (cc-directive-*)

```yaml
# metanorma.release.yml
#
# Single-document repo for CalConnect directives.

documents:
  - source: sources/cc-10001.adoc
    channels: [public/directives]
```

### Multi-channel document

A single document can be published to multiple channels:

```yaml
documents:
  - source: sources/cc-s-51015/document.adoc
    channels: [public/standards, public/admin-reports]
```

### Stage-gated release

Only release when the document reaches a specific stage:

```yaml
documents:
  - pattern: "cc-s-*"
    stages: [published]
    channels: [public/standards]
```

With `stages: [published]`, working drafts and committee drafts are **not
released** — no GitHub Release is created. The document must reach `published`
stage before it appears in any channel.

## Migration guide

### From explicit source lists to pattern matching

Old manifest (190+ explicit entries):
```yaml
documents:
  - source: sources/cc-0001-report-ioptest/document.adoc
  - source: sources/cc-0101-report-ioptest/document.adoc
  # ... 188 more
```

New manifest (4 pattern entries):
```yaml
documents:
  - pattern: "cc-s-*"
    channels: [public/standards]
  - pattern: "cc-r-*"
    channels: [public/reports]
  - pattern: "cc-a-*"
    channels: [public/admin]
  - pattern: "cc-adv-*"
    channels: [public/advisories]
```

### Migration steps

1. Replace source list with pattern matching
2. Keep `default-visibility: private` in workflow (unchanged)
3. Force re-release to add channel metadata to existing releases
4. Verify aggregation output matches expected documents
