import type { ReleaseMetadataJson } from "../domain/types.js";

export class ChannelFilter {
  constructor(private readonly channels: readonly string[] | undefined) {}

  matches(metadata: ReleaseMetadataJson | null): boolean {
    if (!this.channels || this.channels.length === 0) return true;
    if (!metadata) return true; // legacy release — always include
    const releaseChannels = metadata.channels ?? [];
    return this.channels.some((c) => releaseChannels.includes(c));
  }
}
