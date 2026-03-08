import type Anthropic from "@anthropic-ai/sdk";
import type { GenerateDocUpdatesParams, DocFileWithContent, DocUpdate } from "../types";

export async function generateDocUpdates({
  anthropic,
  model,
  prTitle,
  prBody,
  prUrl,
  changeAnalysis,
  relevantDocs,
}: GenerateDocUpdatesParams): Promise<DocUpdate[]> {
  const updates: DocUpdate[] = [];

  for (const doc of relevantDocs) {
    const result = await updateSingleDoc({
      anthropic,
      model,
      prTitle,
      prBody,
      prUrl,
      changeAnalysis,
      doc,
    });

    if (result) {
      updates.push(result);
    }
  }

  return updates;
}

async function updateSingleDoc({
  anthropic,
  model,
  prTitle,
  prBody,
  prUrl,
  changeAnalysis,
  doc,
}: {
  anthropic: Anthropic;
  model: string;
  prTitle: string;
  prBody: string;
  prUrl: string;
  changeAnalysis: string;
  doc: DocFileWithContent;
}): Promise<DocUpdate | null> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: `You are an expert technical writer updating documentation to reflect code changes.

Rules:
- Preserve all existing content, formatting, and style unless it specifically needs updating.
- Only modify sections that are directly affected by the code changes.
- Add new sections only if new features or APIs genuinely require them.
- Do not add "Updated by AI" watermarks, changelog entries, or meta-commentary.
- Maintain the existing document structure, headings hierarchy, and tone.
- If the document does not need any changes, respond with exactly: NO_CHANGES_NEEDED
- Otherwise, respond with the complete updated file contents, nothing else.`,
    messages: [
      {
        role: "user",
        content: `Update the documentation file below to reflect the code changes from a merged PR.

## Merged PR
- **Title**: ${prTitle}
- **URL**: ${prUrl}
- **Description**: ${prBody || "(none)"}

## Code Change Analysis
${changeAnalysis}

## Documentation File: \`${doc.path}\`
\`\`\`
${doc.content}
\`\`\`

Provide the complete updated contents of \`${doc.path}\` with only the necessary changes applied.
If no changes are needed, respond with exactly: NO_CHANGES_NEEDED`,
      },
    ],
  });

  const responseText = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (
    responseText === "NO_CHANGES_NEEDED" ||
    responseText.includes("NO_CHANGES_NEEDED")
  ) {
    return null;
  }

  const updatedContent = stripCodeFence(responseText, doc.path);

  const originalLen = doc.content.length;
  const updatedLen = updatedContent.length;
  if (originalLen > 200 && updatedLen < originalLen * 0.4) {
    return {
      path: doc.path,
      content: updatedContent,
      originalSha: doc.sha,
      reason:
        "⚠️ Updated content is significantly shorter than original — review carefully",
    };
  }

  return {
    path: doc.path,
    content: updatedContent,
    originalSha: doc.sha,
    reason: "Updated to reflect code changes",
  };
}

export function stripCodeFence(text: string, filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase();
  const fencePattern = new RegExp(
    `^\`\`\`(?:${ext}|markdown|md|rst|text|txt)?\\s*\\n?`,
    "i"
  );
  let result = text.replace(fencePattern, "");
  result = result.replace(/\n?```\s*$/, "");
  return result.trim() + "\n";
}
