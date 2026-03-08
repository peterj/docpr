import * as core from "@actions/core";
import type { GetDocFilesParams, DocFile } from "../types";

const DOC_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".rst",
  ".txt",
  ".adoc",
  ".asciidoc",
]);

export async function getDocFiles({
  octokit,
  owner,
  repo,
  branch,
  basePath,
  maxFiles,
}: GetDocFilesParams): Promise<DocFile[]> {
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const sha = ref.object.sha;

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: sha,
    recursive: "1",
  });

  if (tree.truncated) {
    core.warning(
      "The docs repository tree was truncated by the GitHub API. " +
        "Consider narrowing docs_path to limit scope."
    );
  }

  const normalizedBase = basePath ? basePath.replace(/\/$/, "") + "/" : "";

  return tree.tree
    .filter((item) => {
      if (item.type !== "blob" || !item.path || !item.sha) return false;
      if (normalizedBase && !item.path.startsWith(normalizedBase)) return false;
      const ext = item.path.slice(item.path.lastIndexOf(".")).toLowerCase();
      return DOC_EXTENSIONS.has(ext);
    })
    .slice(0, maxFiles)
    .map((item) => ({ path: item.path!, sha: item.sha! }));
}
