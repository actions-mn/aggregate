import * as core from '@actions/core';
import type { FileRoutingMode } from './processing/asset-processor.js';

export interface AggregateConfig {
  readonly organizations: readonly string[];
  readonly topic: string;
  readonly repos: readonly string[];
  readonly channels: readonly string[];
  readonly stages: readonly string[];
  readonly outputDir: string;
  readonly indexFormat: 'json' | 'jsonl';
  readonly canonicalize: boolean;
  readonly includeDrafts: boolean;
  readonly concurrency: number;
  readonly failOnError: boolean;
  readonly fileRouting: FileRoutingMode;
  readonly cacheDir: string;
  readonly forceFull: boolean;
  readonly token: string;
}

function parseCommaInput(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const VALID_ROUTING: FileRoutingMode[] = ['flat', 'by-doctype', 'by-format'];

export function getInputs(): AggregateConfig {
  const reposInput = core.getInput('repos');
  const format = core.getInput('index-format');
  const routing = core.getInput('file-routing');

  if (format !== 'json' && format !== 'jsonl') {
    throw new Error(
      `Invalid index-format: "${format}". Must be "json" or "jsonl".`
    );
  }

  if (routing && !VALID_ROUTING.includes(routing as FileRoutingMode)) {
    throw new Error(
      `Invalid file-routing: "${routing}". Must be one of: ${VALID_ROUTING.join(', ')}.`
    );
  }

  return {
    organizations: parseCommaInput(core.getInput('organizations')),
    topic: core.getInput('topic'),
    repos: reposInput ? parseCommaInput(reposInput) : [],
    channels: parseCommaInput(core.getInput('channels')),
    stages: parseCommaInput(core.getInput('stages')),
    outputDir: core.getInput('output-dir'),
    indexFormat: format,
    canonicalize: core.getBooleanInput('canonicalize'),
    includeDrafts: core.getBooleanInput('include-drafts'),
    concurrency: parseInt(core.getInput('concurrency'), 10) || 4,
    failOnError: core.getBooleanInput('fail-on-error'),
    fileRouting: (routing || 'flat') as FileRoutingMode,
    cacheDir: core.getInput('cache-dir'),
    forceFull: core.getBooleanInput('force-full'),
    token: core.getInput('token')
  };
}
