import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type {
  AggregatedDocument,
  AggregationParameters,
  DocumentIndex,
} from "../domain/types.js";

export class IndexGenerator {
  async generate(
    documents: readonly AggregatedDocument[],
    outputDir: string,
    format: "json" | "jsonl",
    parameters: AggregationParameters,
  ): Promise<string> {
    await mkdir(outputDir, { recursive: true });

    const channelsFound = [
      ...new Set(documents.flatMap((d) => d.channels)),
    ].sort();

    if (format === "json") {
      return this.writeJson(documents, outputDir, parameters, channelsFound);
    }
    return this.writeJsonl(documents, outputDir);
  }

  private async writeJson(
    documents: readonly AggregatedDocument[],
    outputDir: string,
    parameters: AggregationParameters,
    channelsFound: string[],
  ): Promise<string> {
    const index: DocumentIndex = {
      version: 1,
      generatedAt: new Date().toISOString(),
      parameters,
      summary: {
        repoCount: parameters.repoCount,
        documentCount: documents.length,
        channelsFound,
      },
      documents,
    };

    const indexPath = join(outputDir, "index.json");
    await writeFile(indexPath, JSON.stringify(index, null, 2));
    return indexPath;
  }

  private async writeJsonl(
    documents: readonly AggregatedDocument[],
    outputDir: string,
  ): Promise<string> {
    const lines = documents.map((d) => JSON.stringify(d));
    const indexPath = join(outputDir, "index.jsonl");
    await writeFile(indexPath, lines.join("\n") + "\n");
    return indexPath;
  }
}
