import { describe, it, expect } from 'vitest';
import { StageFilter } from '../../src/filtering/stage-filter.js';
import type { ReleaseMetadataJson } from '../../src/domain/types.js';

function makeMetadata(stage: string): ReleaseMetadataJson {
  return {
    version: 1,
    id: 'cc-51015',
    title: 'Test',
    edition: '1',
    stage,
    doctype: 'standard',
    revdate: null,
    formats: ['html'],
    channels: ['public/default'],
    flavor: null,
    sourcePath: 'sources/cc-51015.adoc'
  };
}

describe('StageFilter', () => {
  it('matches when stage is in allowed list', () => {
    const filter = new StageFilter(['published']);
    expect(filter.matches(makeMetadata('published'))).toBe(true);
  });

  it('skips when stage not in allowed list', () => {
    const filter = new StageFilter(['published']);
    expect(filter.matches(makeMetadata('working-draft'))).toBe(false);
  });

  it('matches when no stages configured (include all)', () => {
    const filter = new StageFilter(undefined);
    expect(filter.matches(makeMetadata('published'))).toBe(true);
    expect(filter.matches(makeMetadata('working-draft'))).toBe(true);
  });

  it('matches when empty stages array (include all)', () => {
    const filter = new StageFilter([]);
    expect(filter.matches(makeMetadata('published'))).toBe(true);
  });

  it('includes legacy releases with no metadata', () => {
    const filter = new StageFilter(['published']);
    expect(filter.matches(null)).toBe(true);
  });
});
