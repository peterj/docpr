import type { GetPRDiffParams } from "../types";

export async function getPRDiff({
  octokit,
  owner,
  repo,
  prNumber,
}: GetPRDiffParams): Promise<string> {
  try {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    if (typeof response.data === "string") {
      return truncateDiff(response.data);
    }
  } catch {
    // Fall through to file-by-file approach
  }

  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const parts = files.map((f) => {
    const header = `diff --git a/${f.filename} b/${f.filename}\n--- a/${f.filename}\n+++ b/${f.filename}`;
    return f.patch ? `${header}\n${f.patch}` : header;
  });

  return truncateDiff(parts.join("\n\n"));
}

export function truncateDiff(diff: string, maxChars: number = 80_000): string {
  if (diff.length <= maxChars) return diff;

  const half = Math.floor(maxChars / 2);
  const head = diff.slice(0, half);
  const tail = diff.slice(diff.length - half);
  return head + "\n\n[... diff truncated for length ...]\n\n" + tail;
}
