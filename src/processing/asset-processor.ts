import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import AdmZip from "adm-zip";
import type { DocumentFile, ReleaseMetadataJson } from "../domain/types.js";

export interface ProcessedRelease {
  readonly files: readonly DocumentFile[];
  readonly channels: readonly string[];
}

export class AssetProcessor {
  private static readonly EDITION_SUFFIX = /-ed\d+(\.\d+)?(-[a-z0-9]+)?\./;

  constructor(private readonly canonicalize: boolean = true) {}

  async process(
    zipBuffer: Buffer,
    outputDir: string,
    metadata: ReleaseMetadataJson | null,
  ): Promise<ProcessedRelease> {
    await mkdir(outputDir, { recursive: true });

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const files: DocumentFile[] = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const originalName = entry.entryName;
      const name = this.canonicalize
        ? originalName.replace(AssetProcessor.EDITION_SUFFIX, ".")
        : originalName;

      const filePath = join(outputDir, name);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, entry.getData());
      files.push({ name, path: name });
    }

    return {
      files,
      channels: metadata?.channels ?? [],
    };
  }
}
