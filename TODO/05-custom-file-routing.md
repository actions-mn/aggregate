# 05: Custom File Routing

> **Status: TODO**
> **Priority**: Future enhancement
> **Depends on**: None

## Problem

All extracted files currently land in a flat `output-dir`. Some portals may want
structured output (e.g., `output/{doctype}/{id}.pdf`) or file-type subdirectories
(e.g., `output/pdf/`, `output/html/`).

## Design

Add an optional `file-routing` input that controls how files are organized in
the output directory:

| Value | Layout | Example |
|---|---|---|
| `flat` (default) | All files in `output-dir/` | `_site/cc/cc-51015.pdf` |
| `by-doctype` | Subdirectories by document type | `_site/cc/standards/cc-51015.pdf` |
| `by-format` | Subdirectories by file extension | `_site/cc/pdf/cc-51015.pdf` |

```yaml
- uses: actions-mn/aggregate@v1
  with:
    organizations: CalConnect
    channels: 'public/standards'
    output-dir: _site/cc
    file-routing: by-doctype
```

## Acceptance criteria

- `flat` routing matches current behavior (default, no breaking change)
- `by-doctype` creates `{output-dir}/{doctype}/` subdirectories
- `by-format` creates `{output-dir}/{ext}/` subdirectories
- Index `files` entries reflect actual paths in output dir
