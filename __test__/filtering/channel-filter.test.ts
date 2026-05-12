import { describe, it, expect } from 'vitest';
import { ChannelFilter } from '../../src/filtering/channel-filter.js';
import type { ReleaseMetadataJson } from '../../src/domain/types.js';

function makeMetadata(channels: string[]): ReleaseMetadataJson {
  return {
    version: 1,
    id: 'cc-51015',
    title: 'Test',
    edition: '1',
    stage: 'published',
    doctype: 'standard',
    revdate: null,
    formats: ['html'],
    channels,
    flavor: null,
    sourcePath: 'sources/cc-51015.adoc'
  };
}

describe('ChannelFilter', () => {
  describe('matches', () => {
    it('matches when channel overlaps', () => {
      const filter = new ChannelFilter(['public/standards']);
      expect(filter.matches(makeMetadata(['public/standards']))).toBe(true);
    });

    it('skips when no channel overlap', () => {
      const filter = new ChannelFilter(['public/standards']);
      expect(filter.matches(makeMetadata(['members/internal-review']))).toBe(
        false
      );
    });

    it('matches when no channels configured (include all)', () => {
      const filter = new ChannelFilter(undefined);
      expect(filter.matches(makeMetadata(['public/standards']))).toBe(true);
      expect(filter.matches(makeMetadata(['members/default']))).toBe(true);
    });

    it('matches when empty channels array (include all)', () => {
      const filter = new ChannelFilter([]);
      expect(filter.matches(makeMetadata(['public/standards']))).toBe(true);
    });

    it('includes legacy releases with no metadata', () => {
      const filter = new ChannelFilter(['public/standards']);
      expect(filter.matches(null)).toBe(true);
    });

    it('matches when multiple configured channels overlap', () => {
      const filter = new ChannelFilter(['public/standards', 'members/default']);
      expect(filter.matches(makeMetadata(['members/default']))).toBe(true);
    });

    it('matches when release has multiple channels and one overlaps', () => {
      const filter = new ChannelFilter(['public/standards']);
      expect(
        filter.matches(
          makeMetadata(['public/standards', 'public/admin-reports'])
        )
      ).toBe(true);
    });
  });

  describe('overlaps', () => {
    it('returns true when channels overlap', () => {
      const filter = new ChannelFilter(['public/standards']);
      expect(filter.overlaps(['public/standards'])).toBe(true);
    });

    it('returns false when no overlap', () => {
      const filter = new ChannelFilter(['public/standards']);
      expect(filter.overlaps(['members/internal'])).toBe(false);
    });

    it('returns true when no channels configured', () => {
      const filter = new ChannelFilter(undefined);
      expect(filter.overlaps(['anything'])).toBe(true);
    });

    it('returns true when empty channels array', () => {
      const filter = new ChannelFilter([]);
      expect(filter.overlaps(['anything'])).toBe(true);
    });

    it('returns true for partial overlap', () => {
      const filter = new ChannelFilter(['public/standards', 'members/review']);
      expect(filter.overlaps(['members/review', 'internal/other'])).toBe(true);
    });
  });
});
