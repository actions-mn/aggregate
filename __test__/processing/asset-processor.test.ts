import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AssetProcessor } from "../../src/processing/asset-processor.js";
import { mkdir, rm, readFile } from "fs/promises";
import { join } from "path";
import AdmZip from "adm-zip";
import type { ReleaseMetadataJson } from "../../src/domain/types.js";

describe("AssetProcessor", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(__dirname, "tmp-asset-test");
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  function makeZip(files: Record<string, string>): Buffer {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) {
      zip.addFile(name, Buffer.from(content));
    }
    return zip.toBuffer();
  }

  it("extracts files from zip", async () => {
    const processor = new AssetProcessor(true);
    const zipBuffer = makeZip({
      "cc-51015-ed1.html": "<html>",
      "cc-51015-ed1.pdf": "%PDF",
      "cc-51015-ed1.xml": "<root/>",
    });

    const result = await processor.process(zipBuffer, tmpDir, null);

    expect(result.files).toHaveLength(3);
    const names = result.files.map((f) => f.name).sort();
    expect(names).toEqual(["cc-51015.html", "cc-51015.pdf", "cc-51015.xml"]);

    // Verify files were written
    const html = await readFile(join(tmpDir, "cc-51015.html"), "utf-8");
    expect(html).toBe("<html>");
  });

  it("canonicalizes edition suffixes when enabled", async () => {
    const processor = new AssetProcessor(true);
    const zipBuffer = makeZip({
      "cc-51015-ed1.html": "content",
      "cc-51015-ed2-wd.pdf": "content",
    });

    const result = await processor.process(zipBuffer, tmpDir, null);
    const names = result.files.map((f) => f.name).sort();
    expect(names).toEqual(["cc-51015.html", "cc-51015.pdf"]);
  });

  it("preserves original names when canonicalize=false", async () => {
    const processor = new AssetProcessor(false);
    const zipBuffer = makeZip({
      "cc-51015-ed1.html": "content",
      "cc-51015-ed2-wd.pdf": "content",
    });

    const result = await processor.process(zipBuffer, tmpDir, null);
    const names = result.files.map((f) => f.name).sort();
    expect(names).toEqual(["cc-51015-ed1.html", "cc-51015-ed2-wd.pdf"]);
  });

  it("extracts channels from metadata", async () => {
    const processor = new AssetProcessor(true);
    const zipBuffer = makeZip({ "doc.html": "x" });
    const metadata: ReleaseMetadataJson = {
      version: 1,
      id: "test",
      title: "Test",
      edition: "1",
      stage: "published",
      doctype: "standard",
      revdate: null,
      formats: ["html"],
      channels: ["public/standards"],
      flavor: null,
      sourcePath: "sources/test.adoc",
    };

    const result = await processor.process(zipBuffer, tmpDir, metadata);
    expect(result.channels).toEqual(["public/standards"]);
  });

  it("returns empty channels when no metadata", async () => {
    const processor = new AssetProcessor(true);
    const zipBuffer = makeZip({ "doc.html": "x" });

    const result = await processor.process(zipBuffer, tmpDir, null);
    expect(result.channels).toEqual([]);
  });

  it("skips directory entries", async () => {
    const processor = new AssetProcessor(true);
    const zip = new AdmZip();
    zip.addFile("dir/", Buffer.alloc(0));
    zip.addFile("dir/file.html", Buffer.from("content"));

    const result = await processor.process(zip.toBuffer(), tmpDir, null);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("dir/file.html");
  });
});
