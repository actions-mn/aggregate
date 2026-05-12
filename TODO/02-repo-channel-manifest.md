# 02: Repository-Level Channel Manifest Discovery

> **Status: TODO**
> **Priority**: Optimization
> **Depends on**: None
> **Reference**: Spec 12 §5 (`.metanorma/channels.yml`)

## Problem

Every aggregation run fetches all releases from every repo, even if the repo
doesn't publish to any channels the aggregator cares about. With many repos,
this wastes API calls.

## Design

Before listing releases, check for `.metanorma/channels.yml` in each repo. If
present, read its declared channels and skip the repo if none match the
configured channel filter.

```yaml
# .metanorma/channels.yml (in publisher repos)
channels:
  - name: public/standards
    description: "Published standards"
  - name: members/internal-review
    description: "Internal review drafts"
```

```typescript
async shouldProcessRepo(repo: RepoRef, channelFilter: ChannelFilter): Promise<boolean> {
  try {
    const { data } = await api.repos.getContent({
      owner: repo.owner, repo: repo.repo,
      path: '.metanorma/channels.yml',
    });
    const channels = parseYaml(atob(data.content));
    return channelFilter.overlaps(channels.map(c => c.name));
  } catch {
    // No manifest — process anyway (backward compat)
    return true;
  }
}
```

## Acceptance criteria

- Read `.metanorma/channels.yml` from each discovered repo
- Skip repos whose declared channels don't overlap with configured channels
- Graceful fallback when manifest is absent or malformed
- Logged at info level: "Skipping repo X: no matching channels"
