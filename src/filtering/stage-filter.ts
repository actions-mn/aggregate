import type { ReleaseMetadataJson } from "../domain/types.js";

export class StageFilter {
  constructor(private readonly stages: readonly string[] | undefined) {}

  matches(metadata: ReleaseMetadataJson | null): boolean {
    if (!this.stages || this.stages.length === 0) return true;
    if (!metadata) return true; // legacy release — always include
    return this.stages.includes(metadata.stage);
  }
}
