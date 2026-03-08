import { describe, it, expect, vi } from "vitest";

vi.mock("@actions/core", () => ({
  warning: vi.fn(),
}));

import { getDocFiles } from "../github/getDocFiles";

function createMockOctokit(
  treeSha: string,
  treeItems: Array<{ path?: string; sha?: string; type?: string }>,
  truncated = false
) {
  return {
    rest: {
      git: {
        getRef: vi.fn().mockResolvedValue({
          data: { object: { sha: treeSha } },
        }),
        getTree: vi.fn().mockResolvedValue({
          data: {
            tree: treeItems,
            truncated,
          },
        }),
      },
    },
  } as any;
}

describe("getDocFiles", () => {
  it("returns only documentation files with valid extensions", async () => {
    const octokit = createMockOctokit("abc123", [
      { path: "docs/guide.md", sha: "s1", type: "blob" },
      { path: "docs/api.mdx", sha: "s2", type: "blob" },
      { path: "docs/tutorial.rst", sha: "s3", type: "blob" },
      { path: "docs/notes.txt", sha: "s4", type: "blob" },
      { path: "docs/book.adoc", sha: "s5", type: "blob" },
      { path: "docs/manual.asciidoc", sha: "s6", type: "blob" },
      { path: "src/index.ts", sha: "s7", type: "blob" },
      { path: "package.json", sha: "s8", type: "blob" },
      { path: "docs/images", sha: "s9", type: "tree" },
    ]);

    const result = await getDocFiles({
      octokit,
      owner: "org",
      repo: "docs-repo",
      branch: "main",
      basePath: "",
      maxFiles: 100,
    });

    expect(result).toHaveLength(6);
    expect(result.map((f) => f.path)).toEqual([
      "docs/guide.md",
      "docs/api.mdx",
      "docs/tutorial.rst",
      "docs/notes.txt",
      "docs/book.adoc",
      "docs/manual.asciidoc",
    ]);
  });

  it("filters by basePath", async () => {
    const octokit = createMockOctokit("abc123", [
      { path: "docs/guide.md", sha: "s1", type: "blob" },
      { path: "content/api.md", sha: "s2", type: "blob" },
      { path: "docs/nested/deep.md", sha: "s3", type: "blob" },
    ]);

    const result = await getDocFiles({
      octokit,
      owner: "org",
      repo: "repo",
      branch: "main",
      basePath: "docs",
      maxFiles: 100,
    });

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toEqual([
      "docs/guide.md",
      "docs/nested/deep.md",
    ]);
  });

  it("handles basePath with trailing slash", async () => {
    const octokit = createMockOctokit("abc123", [
      { path: "docs/guide.md", sha: "s1", type: "blob" },
    ]);

    const result = await getDocFiles({
      octokit,
      owner: "org",
      repo: "repo",
      branch: "main",
      basePath: "docs/",
      maxFiles: 100,
    });

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("docs/guide.md");
  });

  it("respects maxFiles limit", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      path: `docs/file-${i}.md`,
      sha: `sha-${i}`,
      type: "blob",
    }));
    const octokit = createMockOctokit("abc123", items);

    const result = await getDocFiles({
      octokit,
      owner: "org",
      repo: "repo",
      branch: "main",
      basePath: "",
      maxFiles: 10,
    });

    expect(result).toHaveLength(10);
  });

  it("warns when tree is truncated", async () => {
    const core = await import("@actions/core");
    const octokit = createMockOctokit(
      "abc123",
      [{ path: "docs/guide.md", sha: "s1", type: "blob" }],
      true
    );

    await getDocFiles({
      octokit,
      owner: "org",
      repo: "repo",
      branch: "main",
      basePath: "",
      maxFiles: 100,
    });

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("truncated")
    );
  });

  it("returns empty array when no doc files exist", async () => {
    const octokit = createMockOctokit("abc123", [
      { path: "src/index.ts", sha: "s1", type: "blob" },
      { path: "package.json", sha: "s2", type: "blob" },
    ]);

    const result = await getDocFiles({
      octokit,
      owner: "org",
      repo: "repo",
      branch: "main",
      basePath: "",
      maxFiles: 100,
    });

    expect(result).toEqual([]);
  });

  it("skips items without path or sha", async () => {
    const octokit = createMockOctokit("abc123", [
      { path: undefined, sha: "s1", type: "blob" },
      { path: "docs/guide.md", sha: undefined, type: "blob" },
      { path: "docs/real.md", sha: "s3", type: "blob" },
    ]);

    const result = await getDocFiles({
      octokit,
      owner: "org",
      repo: "repo",
      branch: "main",
      basePath: "",
      maxFiles: 100,
    });

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("docs/real.md");
  });
});
