# 06: Partial Failure Reporting

> **Status: TODO**
> **Priority**: Observability
> **Depends on**: None

## Problem

When individual repo or release processing fails, the action still succeeds
with a generic log message. There's no structured way to detect partial failures
or alert on them.

## Design

Enhance the `aggregation-report` output with structured error details and add
an optional `fail-on-error` input:

```yaml
outputs:
  aggregation-report:
    description: 'JSON with per-repo stats and error details'
  failed-repos:
    description: 'JSON array of repos that failed processing'
```

```typescript
interface RepoReport {
  releases: number;
  included: number;
  skipped: number;
  reason: string;
  errors?: Array<{ tag: string; message: string }>;
}
```

Add `fail-on-error` input (default `false`):

```yaml
fail-on-error:
  description: 'Fail the action if any repo processing fails'
  default: 'false'
```

## Acceptance criteria

- `aggregation-report` includes per-release error details
- `failed-repos` output lists repos that had errors
- `fail-on-error: true` fails the action on any repo error
- Default behavior unchanged (best-effort aggregation)
