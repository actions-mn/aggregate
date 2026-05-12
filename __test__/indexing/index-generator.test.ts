import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IndexGenerator } from "../../src/indexing/index-generator.js";
import { mkdir, rm, readFile } from "fs/promises";
import { join } from "path";
import type {
  AggregatedDocument,
  AggregationParameters,
} from "../../src/domain/types.js";

function makeDoc(id: string, channels: string[] = []): AggregatedDocument {
  return {
    id,
    title: `Doc ${id}`,
    edition: "1",
    stage: "published",
    doctype: "standard",
    channels,
    formats: ["html"],
    flavor: null,
    contentHash: null,
    source: {
      owner: "test",
      repo: "repo",
      tag: `${id}/ed1`,
      releaseUrl: "https://github.com/test/repo/releases/tag/test",
      releaseDate: "2025-01-01T00:00:00Z",
    },
    files: [{ name: `${id}.html`, path: `${id}.html` }],
  };
}

describe("IndexGenerator", () => {
  let tmpDir: string;
  const parameters: AggregationParameters = {
    organizations: ["TestOrg"],
    channels: ["public/standards"],
    topic: "metanorma-release",
    repoCount: 1,
  };

  beforeEach(async () => {
    tmpDir = join(__dirname, "tmp-index-test");
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("produces valid JSON index", async () => {
    const generator = new IndexGenerator();
    const docs = [
      makeDoc("cc-1", ["public/standards"]),
      makeDoc("cc-2", ["public/admin"]),
    ];

    const indexPath = await generator.generate(
      docs,
      tmpDir,
      "json",
      parameters,
    );
    expect(indexPath).toBe(join(tmpDir, "index.json"));

    const content = await readFile(indexPath, "utf-8");
    const index = JSON.parse(content);

    expect(index.version).toBe(1);
    expect(index.generatedAt).toBeTruthy();
    expect(index.parameters.organizations).toEqual(["TestOrg"]);
    expect(index.summary.documentCount).toBe(2);
    expect(index.summary.channelsFound).toEqual([
      "public/admin",
      "public/standards",
    ]);
    expect(index.documents).toHaveLength(2);
  });

  it("produces valid JSONL output", async () => {
    const generator = new IndexGenerator();
    const docs = [makeDoc("cc-1"), makeDoc("cc-2")];

    const indexPath = await generator.generate(
      docs,
      tmpDir,
      "jsonl",
      parameters,
    );
    expect(indexPath).toBe(join(tmpDir, "index.jsonl"));

    const content = await readFile(indexPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);

    const doc1 = JSON.parse(lines[0]);
    expect(doc1.id).toBe("cc-1");
  });

  it("handles empty documents list", async () => {
    const generator = new IndexGenerator();

    const indexPath = await generator.generate([], tmpDir, "json", parameters);
    const content = await readFile(indexPath, "utf-8");
    const index = JSON.parse(content);

    expect(index.documents).toHaveLength(0);
    expect(index.summary.documentCount).toBe(0);
    expect(index.summary.channelsFound).toEqual([]);
  });
});
