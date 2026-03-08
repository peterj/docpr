import { describe, it, expect, vi } from "vitest";
import { getPRDiff, truncateDiff } from "../github/getPRDiff";

function createMockOctokit(overrides: Record<string, unknown> = {}) {
  return {
    rest: {
      pulls: {
        get: vi.fn(),
        listFiles: vi.fn(),
      },
    },
    paginate: vi.fn(),
    ...overrides,
  } as any;
}

describe("truncateDiff", () => {
  it("returns the diff unchanged when under the limit", () => {
    const diff = "a".repeat(1000);
    expect(truncateDiff(diff, 2000)).toBe(diff);
  });

  it("returns the diff unchanged when exactly at the limit", () => {
    const diff = "a".repeat(2000);
    expect(truncateDiff(diff, 2000)).toBe(diff);
  });

  it("truncates from the middle when over the limit", () => {
    const diff = "A".repeat(50) + "B".repeat(50);
    const result = truncateDiff(diff, 60);

    expect(result).toContain("[... diff truncated for length ...]");
    expect(result.startsWith("A")).toBe(true);
    expect(result.endsWith("B")).toBe(true);
  });

  it("uses default maxChars of 80000", () => {
    const shortDiff = "x".repeat(80_000);
    expect(truncateDiff(shortDiff)).toBe(shortDiff);

    const longDiff = "x".repeat(80_001);
    expect(truncateDiff(longDiff)).toContain(
      "[... diff truncated for length ...]"
    );
  });
});

describe("getPRDiff", () => {
  it("returns the raw diff when the diff endpoint succeeds", async () => {
    const octokit = createMockOctokit();
    octokit.rest.pulls.get.mockResolvedValue({
      data: "diff --git a/file.ts b/file.ts\n+hello",
    });

    const result = await getPRDiff({
      octokit,
      owner: "org",
      repo: "repo",
      prNumber: 42,
    });

    expect(result).toBe("diff --git a/file.ts b/file.ts\n+hello");
    expect(octokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: "org",
      repo: "repo",
      pull_number: 42,
      mediaType: { format: "diff" },
    });
  });

  it("falls back to listFiles when diff endpoint fails", async () => {
    const octokit = createMockOctokit();
    octokit.rest.pulls.get.mockRejectedValue(new Error("Not found"));
    octokit.paginate.mockResolvedValue([
      { filename: "src/app.ts", patch: "@@ -1 +1 @@\n-old\n+new" },
      { filename: "README.md", patch: undefined },
    ]);

    const result = await getPRDiff({
      octokit,
      owner: "org",
      repo: "repo",
      prNumber: 7,
    });

    expect(result).toContain("diff --git a/src/app.ts b/src/app.ts");
    expect(result).toContain("@@ -1 +1 @@\n-old\n+new");
    expect(result).toContain("diff --git a/README.md b/README.md");
    expect(result).not.toContain("undefined");
  });

  it("falls back when diff endpoint returns non-string data", async () => {
    const octokit = createMockOctokit();
    octokit.rest.pulls.get.mockResolvedValue({
      data: { id: 123, title: "not a diff" },
    });
    octokit.paginate.mockResolvedValue([
      { filename: "index.ts", patch: "+added" },
    ]);

    const result = await getPRDiff({
      octokit,
      owner: "org",
      repo: "repo",
      prNumber: 1,
    });

    expect(result).toContain("diff --git a/index.ts b/index.ts");
    expect(result).toContain("+added");
  });

  it("truncates a very large diff", async () => {
    const octokit = createMockOctokit();
    const hugeDiff = "x".repeat(100_000);
    octokit.rest.pulls.get.mockResolvedValue({ data: hugeDiff });

    const result = await getPRDiff({
      octokit,
      owner: "org",
      repo: "repo",
      prNumber: 1,
    });

    expect(result.length).toBeLessThan(hugeDiff.length);
    expect(result).toContain("[... diff truncated for length ...]");
  });
});
