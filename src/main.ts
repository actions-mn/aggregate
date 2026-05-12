import { setFailed, setOutput } from "@actions/core";
import { Octokit } from "@octokit/rest";
import { getInputs } from "./input-helper.js";
import { AggregationPipeline, type PipelineDependencies } from "./pipeline.js";
import { TopicRepoDiscoverer } from "./discovery/topic-discoverer.js";
import { ExplicitRepoDiscoverer } from "./discovery/explicit-discoverer.js";
import { ChannelFilter } from "./filtering/channel-filter.js";
import { StageFilter } from "./filtering/stage-filter.js";
import { AssetProcessor } from "./processing/asset-processor.js";
import { IndexGenerator } from "./indexing/index-generator.js";
import { logger } from "./shared/logger.js";
import type { GitHubAggregationApi } from "./domain/types.js";

async function run(): Promise<void> {
  try {
    const config = getInputs();

    const octokit = new Octokit({
      auth: config.token,
    }) as unknown as GitHubAggregationApi;

    const discoverer =
      config.repos.length > 0
        ? new ExplicitRepoDiscoverer(config.repos)
        : new TopicRepoDiscoverer(octokit, config.organizations, config.topic);

    const channelFilter = new ChannelFilter(
      config.channels.length > 0 ? config.channels : undefined,
    );
    const stageFilter = new StageFilter(
      config.stages.length > 0 ? config.stages : undefined,
    );
    const assetProcessor = new AssetProcessor(config.canonicalize);
    const indexGenerator = new IndexGenerator();

    const deps: PipelineDependencies = {
      discoverer,
      channelFilter,
      stageFilter,
      assetProcessor,
      indexGenerator,
      api: octokit,
      concurrency: config.concurrency,
      includeDrafts: config.includeDrafts,
      organizations: config.organizations,
      channels: config.channels,
      topic: config.topic,
    };

    const pipeline = new AggregationPipeline(deps);
    const result = await pipeline.run(config.outputDir, config.indexFormat);

    const indexPath =
      config.indexFormat === "jsonl"
        ? `${config.outputDir}/index.jsonl`
        : `${config.outputDir}/index.json`;

    setOutput("document-count", result.documents.length);
    setOutput("index-path", indexPath);
    setOutput("repo-count", result.repoCount);
    setOutput("channels-found", JSON.stringify(result.channelsFound));
    setOutput("aggregation-report", JSON.stringify(result.report));

    logger.info(
      `Aggregated ${result.documents.length} documents from ${result.repoCount} repos`,
    );
    if (result.channelsFound.length > 0) {
      logger.info(`Channels found: ${result.channelsFound.join(", ")}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setFailed(`Aggregation failed: ${message}`);
  }
}

run();
