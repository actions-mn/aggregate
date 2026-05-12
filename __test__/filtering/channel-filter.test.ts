import { describe, it, expect } from "vitest";
import { ChannelFilter } from "../../src/filtering/channel-filter.js";
import type { ReleaseMetadataJson } from "../../src/domain/types.js";

function makeMetadata(channels: string[]): ReleaseMetadataJson {
  return {
    version: 1,
    id: "cc-51015",
    title: "Test",
    edition: "1",
    stage: "published",
    doctype: "standard",
    revdate: null,
    formats: ["html"],
    channels,
    flavor: null,
    sourcePath: "sources/cc-51015.adoc",
  };
}

describe("ChannelFilter", () => {
  it("matches when channel overlaps", () => {
    const filter = new ChannelFilter(["public/standards"]);
    expect(filter.matches(makeMetadata(["public/standards"]))).toBe(true);
  });

  it("skips when no channel overlap", () => {
    const filter = new ChannelFilter(["public/standards"]);
    expect(filter.matches(makeMetadata(["members/internal-review"]))).toBe(
      false,
    );
  });

  it("matches when no channels configured (include all)", () => {
    const filter = new ChannelFilter(undefined);
    expect(filter.matches(makeMetadata(["public/standards"]))).toBe(true);
    expect(filter.matches(makeMetadata(["members/default"]))).toBe(true);
  });

  it("matches when empty channels array (include all)", () => {
    const filter = new ChannelFilter([]);
    expect(filter.matches(makeMetadata(["public/standards"]))).toBe(true);
  });

  it("includes legacy releases with no metadata", () => {
    const filter = new ChannelFilter(["public/standards"]);
    expect(filter.matches(null)).toBe(true);
  });

  it("matches when multiple configured channels overlap", () => {
    const filter = new ChannelFilter(["public/standards", "members/default"]);
    expect(filter.matches(makeMetadata(["members/default"]))).toBe(true);
  });

  it("matches when release has multiple channels and one overlaps", () => {
    const filter = new ChannelFilter(["public/standards"]);
    expect(
      filter.matches(
        makeMetadata(["public/standards", "public/admin-reports"]),
      ),
    ).toBe(true);
  });
});
