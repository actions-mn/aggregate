import * as core from "@actions/core";

export interface AggregateConfig {
  readonly organizations: readonly string[];
  readonly topic: string;
  readonly repos: readonly string[];
  readonly channels: readonly string[];
  readonly stages: readonly string[];
  readonly outputDir: string;
  readonly indexFormat: "json" | "jsonl";
  readonly canonicalize: boolean;
  readonly includeDrafts: boolean;
  readonly concurrency: number;
  readonly token: string;
}

function parseCommaInput(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getInputs(): AggregateConfig {
  const reposInput = core.getInput("repos");
  const format = core.getInput("index-format");

  if (format !== "json" && format !== "jsonl") {
    throw new Error(
      `Invalid index-format: "${format}". Must be "json" or "jsonl".`,
    );
  }

  return {
    organizations: parseCommaInput(core.getInput("organizations")),
    topic: core.getInput("topic"),
    repos: reposInput ? parseCommaInput(reposInput) : [],
    channels: parseCommaInput(core.getInput("channels")),
    stages: parseCommaInput(core.getInput("stages")),
    outputDir: core.getInput("output-dir"),
    indexFormat: format,
    canonicalize: core.getBooleanInput("canonicalize"),
    includeDrafts: core.getBooleanInput("include-drafts"),
    concurrency: parseInt(core.getInput("concurrency"), 10) || 4,
    token: core.getInput("token"),
  };
}
