import type { IdentifyRelevantDocsParams } from "../types";

export async function identifyRelevantDocs({
  anthropic,
  model,
  changeAnalysis,
  docFilePaths,
}: IdentifyRelevantDocsParams): Promise<string[]> {
  if (docFilePaths.length === 0) return [];

  const message = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: `You are a technical writer and software engineer.
Given a summary of code changes and a list of documentation file paths,
your job is to identify which documentation files are likely to need updates.
Respond ONLY with a JSON array of file paths, e.g. ["docs/api.md", "docs/config.md"].
Return an empty array [] if no files need updating.
Do not include any explanation or other text — JSON only.`,
    messages: [
      {
        role: "user",
        content: `## Code Change Analysis
${changeAnalysis}

## Available Documentation Files
${docFilePaths.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Based on the code changes above, which of these documentation files are likely to need updates?
Respond with a JSON array of file paths. Return [] if none need updating.`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    const validSet = new Set(docFilePaths);
    return (parsed as unknown[]).filter(
      (p): p is string => typeof p === "string" && validSet.has(p)
    );
  } catch {
    const found = docFilePaths.filter((p) => raw.includes(p));
    return found;
  }
}
