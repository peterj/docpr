import * as core from "@actions/core";
import * as github from "@actions/github";

import { createLLMClient, DEFAULT_MODELS, type LLMProvider } from "./llm";
import { getPRDiff } from "./github/getPRDiff";
import { getDocFiles } from "./github/getDocFiles";
import { createDocsPR } from "./github/createDocsPR";
import { analyzePRChanges } from "./analysis/analyzePRChanges";
import { identifyRelevantDocs } from "./analysis/identifyRelevantDocs";
import { generateDocUpdates } from "./analysis/generateDocUpdates";

const SUPPORTED_PROVIDERS = new Set<string>(["anthropic", "openai"]);

async function run(): Promise<void> {
  try {
    const { context } = github;
    if (
      context.eventName !== "pull_request" &&
      context.eventName !== "pull_request_target"
    ) {
      core.warning(
        "This action is designed to run on pull_request events. Skipping."
      );
      return;
    }

    const pr = context.payload.pull_request;
    if (!pr) {
      core.setFailed("Could not read pull_request payload.");
      return;
    }
    if (!pr.merged) {
      core.info("PR is not merged yet — skipping doc sync.");
      return;
    }

    const provider = (
      core.getInput("llm_provider") || "anthropic"
    ).toLowerCase();
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      core.setFailed(
        `Unsupported llm_provider: "${provider}". Supported: anthropic, openai.`
      );
      return;
    }
    const llmProvider = provider as LLMProvider;

    const apiKey = resolveApiKey(llmProvider);
    if (!apiKey) {
      core.setFailed(
        `No API key provided for provider "${llmProvider}". ` +
          `Set the ${llmProvider === "anthropic" ? "anthropic_api_key" : "openai_api_key"} input.`
      );
      return;
    }

    const docsRepo = core.getInput("docs_repo", { required: true });
    const docsToken = core.getInput("docs_repo_token", { required: true });
    const sourceToken = core.getInput("source_repo_token", { required: true });
    const docsBaseBranch = core.getInput("docs_base_branch") || "main";
    const docsPath = core.getInput("docs_path") || "";
    const model =
      core.getInput("model") || DEFAULT_MODELS[llmProvider];
    const maxDocFiles = parseInt(core.getInput("max_doc_files") || "20", 10);
    const prLabel = core.getInput("pr_label") || "docpr";

    const [docsOwner, docsRepoName] = docsRepo.split("/");
    if (!docsOwner || !docsRepoName) {
      core.setFailed(
        `Invalid docs_repo format: "${docsRepo}". Expected "owner/repo".`
      );
      return;
    }

    const sourceOctokit = github.getOctokit(sourceToken);
    const docsOctokit = github.getOctokit(docsToken);
    const llm = createLLMClient(llmProvider, apiKey);

    const sourceOwner = context.repo.owner;
    const sourceRepoName = context.repo.repo;
    const prNumber = pr.number;
    const prTitle = pr.title ?? `PR #${prNumber}`;
    const prHtmlUrl = pr.html_url ?? "";

    core.info(
      `Processing merged PR #${prNumber}: "${prTitle}" in ${sourceOwner}/${sourceRepoName}`
    );
    core.info(`Using LLM provider: ${llmProvider}, model: ${model}`);

    // Step 1: Fetch PR diff
    core.startGroup("Step 1 — Fetching PR diff");
    const diff = await getPRDiff({
      octokit: sourceOctokit,
      owner: sourceOwner,
      repo: sourceRepoName,
      prNumber,
    });
    core.info(`Fetched diff (${diff.length} chars).`);
    core.endGroup();

    if (!diff.trim()) {
      core.info("PR diff is empty — nothing to analyze.");
      return;
    }

    // Step 2: Analyze what changed
    core.startGroup("Step 2 — Analyzing PR changes");
    const changeAnalysis = await analyzePRChanges({
      llm,
      model,
      prTitle,
      prBody: pr.body || "",
      diff,
    });
    core.info("Change analysis complete.");
    core.info(changeAnalysis);
    core.endGroup();

    // Step 3: Fetch doc file tree
    core.startGroup("Step 3 — Fetching documentation file tree");
    const docFiles = await getDocFiles({
      octokit: docsOctokit,
      owner: docsOwner,
      repo: docsRepoName,
      branch: docsBaseBranch,
      basePath: docsPath,
      maxFiles: maxDocFiles,
    });
    core.info(`Found ${docFiles.length} documentation file(s).`);
    core.endGroup();

    if (docFiles.length === 0) {
      core.warning(
        `No documentation files found in ${docsRepo}/${docsPath}. ` +
          `Check the docs_path input and ensure the repo is accessible.`
      );
      return;
    }

    // Step 4: Identify which docs are relevant
    core.startGroup("Step 4 — Identifying relevant documentation files");
    const relevantPaths = await identifyRelevantDocs({
      llm,
      model,
      changeAnalysis,
      docFilePaths: docFiles.map((f) => f.path),
    });
    core.info(
      `Relevant doc files (${relevantPaths.length}): ${relevantPaths.join(", ") || "none"}`
    );
    core.endGroup();

    if (relevantPaths.length === 0) {
      core.info(
        "LLM determined that no documentation files need updating. Done."
      );
      core.setOutput("docs_pr_url", "");
      core.setOutput("updated_files", "[]");
      return;
    }

    // Step 5: Fetch full content of relevant docs
    core.startGroup("Step 5 — Fetching content of relevant doc files");
    const relevantDocs: { path: string; content: string; sha: string }[] = [];
    for (const filePath of relevantPaths) {
      try {
        const { data } = await docsOctokit.rest.repos.getContent({
          owner: docsOwner,
          repo: docsRepoName,
          path: filePath,
          ref: docsBaseBranch,
        });
        if (!Array.isArray(data) && data.type === "file" && "content" in data) {
          const content = Buffer.from(data.content, "base64").toString("utf8");
          relevantDocs.push({ path: filePath, content, sha: data.sha });
          core.info(`  ✓ ${filePath} (${content.length} chars)`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        core.warning(`Could not fetch ${filePath}: ${message}`);
      }
    }
    core.endGroup();

    // Step 6: Generate documentation updates
    core.startGroup("Step 6 — Generating documentation updates");
    const updates = await generateDocUpdates({
      llm,
      model,
      prTitle,
      prBody: pr.body || "",
      prUrl: prHtmlUrl,
      changeAnalysis,
      relevantDocs,
    });
    core.info(`LLM proposed updates to ${updates.length} file(s).`);
    core.endGroup();

    if (updates.length === 0) {
      core.info(
        "LLM reviewed the docs and decided no changes were necessary. Done."
      );
      core.setOutput("docs_pr_url", "");
      core.setOutput("updated_files", "[]");
      return;
    }

    // Step 7: Create PR in docs repo
    core.startGroup("Step 7 — Creating documentation PR");
    const docsPrUrl = await createDocsPR({
      octokit: docsOctokit,
      owner: docsOwner,
      repo: docsRepoName,
      baseBranch: docsBaseBranch,
      prLabel,
      sourcePR: {
        number: prNumber,
        title: prTitle,
        url: prHtmlUrl,
        repo: `${sourceOwner}/${sourceRepoName}`,
      },
      updates,
    });
    core.info(`Documentation PR created: ${docsPrUrl}`);
    core.endGroup();

    core.setOutput("docs_pr_url", docsPrUrl);
    core.setOutput(
      "updated_files",
      JSON.stringify(updates.map((u) => u.path))
    );
    core.info(`Done! Documentation PR: ${docsPrUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    core.setFailed(`Action failed: ${message}\n${stack}`);
  }
}

function resolveApiKey(provider: LLMProvider): string {
  switch (provider) {
    case "anthropic":
      return core.getInput("anthropic_api_key");
    case "openai":
      return core.getInput("openai_api_key");
    default:
      return "";
  }
}

run();
