import type { AnalyzePRChangesParams } from "../types";

export async function analyzePRChanges({
  anthropic,
  model,
  prTitle,
  prBody,
  diff,
}: AnalyzePRChangesParams): Promise<string> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    system: `You are a senior software engineer analyzing pull requests to help keep documentation up to date.
Your task is to produce a clear, structured analysis of what changed in a pull request.
Focus on changes that could affect documentation: new features, changed APIs, updated behavior,
removed functionality, new configuration options, changed defaults, new dependencies, etc.
Be specific and technical. Do not pad your response.`,
    messages: [
      {
        role: "user",
        content: `Analyze the following merged pull request and summarize all changes that could potentially require documentation updates.

## PR Title
${prTitle}

## PR Description
${prBody || "(no description provided)"}

## Diff
\`\`\`diff
${diff}
\`\`\`

Produce a structured analysis with these sections:
1. **Summary** – one-paragraph overview of the PR's purpose
2. **API / Interface Changes** – new, modified, or removed functions, classes, endpoints, props, CLI flags, etc.
3. **Behavior Changes** – changed defaults, new error conditions, modified logic visible to users
4. **New Features** – capabilities that did not exist before
5. **Removed / Deprecated** – anything removed or marked deprecated
6. **Configuration / Setup Changes** – new env vars, config keys, setup steps, dependencies
7. **Documentation Impact** – your assessment of which areas of docs are most likely to need updating

Be concise but thorough. If a section has no relevant changes, write "None."`,
      },
    ],
  });

  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
