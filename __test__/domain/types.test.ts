import { describe, it, expect } from "vitest";
import {
  parseReleaseMetadata,
  extractContentHash,
} from "../../src/domain/types.js";

describe("parseReleaseMetadata", () => {
  it("extracts metadata from body with JSON comment block", () => {
    const body = `content-hash:abc123

<!-- mn-release-metadata
{
  "version": 1,
  "id": "cc-51015",
  "title": "Test",
  "edition": "1",
  "stage": "published",
  "doctype": "standard",
  "revdate": null,
  "formats": ["html", "pdf"],
  "channels": ["public/standards"],
  "flavor": "cc",
  "sourcePath": "sources/cc-51015.adoc"
}
-->

## Test Document`;

    const meta = parseReleaseMetadata(body);
    expect(meta).not.toBeNull();
    expect(meta!.id).toBe("cc-51015");
    expect(meta!.version).toBe(1);
    expect(meta!.channels).toEqual(["public/standards"]);
    expect(meta!.formats).toEqual(["html", "pdf"]);
  });

  it("returns null for nil body", () => {
    expect(parseReleaseMetadata(null)).toBeNull();
    expect(parseReleaseMetadata(undefined)).toBeNull();
    expect(parseReleaseMetadata("")).toBeNull();
  });

  it("returns null when no metadata block found", () => {
    expect(parseReleaseMetadata("just some text")).toBeNull();
  });

  it("returns null for malformed JSON in block", () => {
    const body = `<!-- mn-release-metadata\n{invalid json}\n-->`;
    expect(parseReleaseMetadata(body)).toBeNull();
  });
});

describe("extractContentHash", () => {
  it("extracts hash from first line", () => {
    expect(extractContentHash("content-hash:abc123def456")).toBe(
      "abc123def456",
    );
  });

  it("extracts hash from body with hash on first line", () => {
    const body = `content-hash:deadbeef\n\nOther content`;
    expect(extractContentHash(body)).toBe("deadbeef");
  });

  it("returns null for nil body", () => {
    expect(extractContentHash(null)).toBeNull();
    expect(extractContentHash(undefined)).toBeNull();
  });

  it("returns null when no hash found", () => {
    expect(extractContentHash("no hash here")).toBeNull();
  });
});
