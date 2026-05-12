import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import AdmZip from 'adm-zip';
import type { DocumentFile, ReleaseMetadataJson } from '../domain/types.js';

export type FileRoutingMode = 'flat' | 'by-doctype' | 'by-format';

export interface ProcessedRelease {
  readonly files: readonly DocumentFile[];
  readonly channels: readonly string[];
}

export class AssetProcessor {
  private static readonly EDITION_SUFFIX = /-ed\d+(\.\d+)?(-[a-z0-9]+)?\./;

  constructor(
    private readonly canonicalize: boolean = true,
    private readonly routing: FileRoutingMode = 'flat'
  ) {}

  async process(
    zipBuffer: Buffer,
    outputDir: string,
    metadata: ReleaseMetadataJson | null
  ): Promise<ProcessedRelease> {
    await mkdir(outputDir, { recursive: true });

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const files: DocumentFile[] = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const originalName = entry.entryName;
      const name = this.canonicalize
        ? originalName.replace(AssetProcessor.EDITION_SUFFIX, '.')
        : originalName;

      const filePath = this.resolvePath(name, metadata, outputDir);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, entry.getData());

      const relativePath = filePath.slice(outputDir.length + 1);
      files.push({ name, path: relativePath });
    }

    return {
      files,
      channels: metadata?.channels ?? []
    };
  }

  private resolvePath(
    name: string,
    metadata: ReleaseMetadataJson | null,
    outputDir: string
  ): string {
    switch (this.routing) {
      case 'by-doctype': {
        const doctype = metadata?.doctype ?? 'standard';
        return join(outputDir, doctype, name);
      }
      case 'by-format': {
        const dot = name.lastIndexOf('.');
        const ext = dot === -1 ? 'other' : name.slice(dot + 1).toLowerCase();
        return join(outputDir, ext, name);
      }
      default:
        return join(outputDir, name);
    }
  }
}
