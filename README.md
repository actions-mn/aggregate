# actions-mn/aggregate

Aggregate released Metanorma documents from GitHub repositories with channel-based filtering.

Part of the [actions-mn](https://github.com/actions-mn) ecosystem. Consumes releases published by [`actions-mn/release`](https://github.com/actions-mn/release).

## Usage

```yaml
- uses: actions-mn/aggregate@v1
  with:
    organizations: CalConnect
    topic: metanorma-release
    channels: 'public/standards,public/admin-reports'
    output-dir: _site/cc
    canonicalize: true
    token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Default |
|---|---|---|
| `organizations` | Comma-separated GitHub organizations to scan | `''` |
| `topic` | Repository topic for auto-discovery | `metanorma-release` |
| `repos` | Explicit repo list (`owner/repo`, comma-separated). Skips topic discovery. | `''` |
| `channels` | Comma-separated channels to include. Empty = all. | `''` |
| `stages` | Comma-separated stages to include. Empty = all. | `''` |
| `output-dir` | Directory for extracted document files | `_site/documents` |
| `index-format` | Index format: `json` or `jsonl` | `json` |
| `canonicalize` | Strip edition suffixes from filenames | `true` |
| `include-drafts` | Include GitHub draft releases | `false` |
| `concurrency` | Max parallel repo processing | `4` |
| `token` | GitHub token for API access | `${{ github.token }}` |

## Outputs

| Output | Description |
|---|---|
| `document-count` | Number of documents aggregated |
| `index-path` | Path to the generated index file |
| `repo-count` | Number of repos scanned |
| `channels-found` | JSON array of all channels found |
| `aggregation-report` | JSON object with per-repo statistics |

## How it works

1. **Discover** — Finds repos by GitHub topic or from an explicit list
2. **Fetch** — Lists releases from each repo via GitHub API
3. **Parse** — Extracts `mn-release-metadata` JSON from release bodies
4. **Filter** — Includes releases matching configured channels and stages
5. **Download** — Downloads zip assets, extracts, and canonicalizes filenames
6. **Index** — Generates a structured JSON document index

## Index format

The action writes `index.json` (or `index.jsonl`) to the output directory:

```json
{
  "version": 1,
  "generatedAt": "2025-05-12T06:00:00Z",
  "parameters": { "organizations": ["CalConnect"], "channels": ["public/standards"], "topic": "metanorma-release" },
  "summary": { "repoCount": 5, "documentCount": 42, "channelsFound": ["public/standards"] },
  "documents": [ { "id": "cc-51015", "title": "...", "channels": ["public/standards"], "files": [...] } ]
}
```

## Examples

### Explicit repos

```yaml
- uses: actions-mn/aggregate@v1
  with:
    repos: 'my-org/repo-a,my-org/repo-b'
    channels: 'public/guides'
    output-dir: _site/guides
```

### Multi-org

```yaml
- uses: actions-mn/aggregate@v1
  with:
    organizations: 'OrgA,OrgB'
    channels: 'public/standards'
    output-dir: _site/docs
    token: ${{ secrets.PAT_TOKEN }}
```

### Draft aggregation

```yaml
- uses: actions-mn/aggregate@v1
  with:
    organizations: CalConnect
    channels: 'members/internal-review'
    stages: 'draft,working-draft'
    output-dir: _site/drafts
    include-drafts: true
    token: ${{ secrets.MEMBER_TOKEN }}
```

## Backward compatibility

Releases without `mn-release-metadata` (pre-channel releases) are always included, ensuring smooth migration from older versions of `actions-mn/release`.

## License

MIT
