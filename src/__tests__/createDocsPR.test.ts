import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
}));

import { createDocsPR, buildPRBody } from "../github/createDocsPR";
import type { DocUpdate, SourcePR } from "../types";

function createMockOctokit() {
  return {
    rest: {
      git: {
        getRef: vi.fn().mockResolvedValue({
          data: { object: { sha: "base-sha-123" } },
        }),
        createRef: vi.fn().mockResolvedValue({}),
      },
      repos: {
        createOrUpdateFileContents: vi.fn().mockResolvedValue({}),
      },
      pulls: {
        create: vi.fn().mockResolvedValue({
          data: {
            number: 99,
            html_url: "https://github.com/org/docs/pull/99",
          },
        }),
      },
      issues: {
        getLabel: vi.fn().mockResolvedValue({}),
        createLabel: vi.fn().mockResolvedValue({}),
        addLabels: vi.fn().mockResolvedValue({}),
      },
    },
  } as any;
}

const sourcePR: SourcePR = {
  number: 42,
  title: "Add new API endpoint",
  url: "https://github.com/org/code/pull/42",
  repo: "org/code",
};

const updates: DocUpdate[] = [
  {
    path: "docs/api.md",
    content: "# Updated API docs\n",
    originalSha: "sha-old-1",
    reason: "Updated to reflect code changes",
  },
  {
    path: "docs/config.md",
    content: "# Updated config\n",
    originalSha: "sha-old-2",
    reason: "Updated to reflect code changes",
  },
];

describe("createDocsPR", () => {
  let octokit: ReturnType<typeof createMockOctokit>;

  beforeEach(() => {
    octokit = createMockOctokit();
    vi.clearAllMocks();
  });

  it("creates a branch, commits files, and opens a PR", async () => {
    const url = await createDocsPR({
      octokit,
      owner: "org",
      repo: "docs",
      baseBranch: "main",
      prLabel: "docpr",
      sourcePR,
      updates,
    });

    expect(url).toBe("https://github.com/org/docs/pull/99");

    expect(octokit.rest.git.getRef).toHaveBeenCalledWith({
      owner: "org",
      repo: "docs",
      ref: "heads/main",
    });

    expect(octokit.rest.git.createRef).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "org",
        repo: "docs",
        sha: "base-sha-123",
      })
    );

    expect(
      octokit.rest.repos.createOrUpdateFileContents
    ).toHaveBeenCalledTimes(2);

    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "org",
        repo: "docs",
        base: "main",
      })
    );
  });

  it("generates a sanitized branch name from the PR title", async () => {
    await createDocsPR({
      octokit,
      owner: "org",
      repo: "docs",
      baseBranch: "main",
      prLabel: "",
      sourcePR: {
        ...sourcePR,
        title: "Fix: Handle Edge-Cases & Special (chars)!",
      },
      updates,
    });

    const createRefCall = octokit.rest.git.createRef.mock.calls[0][0];
    const branchRef: string = createRefCall.ref;
    expect(branchRef).toMatch(/^refs\/heads\/docpr\/pr-42-/);
    expect(branchRef).not.toMatch(/[^a-z0-9/\-]/);
  });

  it("includes originalSha when updating existing files", async () => {
    await createDocsPR({
      octokit,
      owner: "org",
      repo: "docs",
      baseBranch: "main",
      prLabel: "",
      sourcePR,
      updates,
    });

    const firstCall =
      octokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
    expect(firstCall.sha).toBe("sha-old-1");
  });

  it("skips label operations when prLabel is empty", async () => {
    await createDocsPR({
      octokit,
      owner: "org",
      repo: "docs",
      baseBranch: "main",
      prLabel: "",
      sourcePR,
      updates,
    });

    expect(octokit.rest.issues.getLabel).not.toHaveBeenCalled();
    expect(octokit.rest.issues.addLabels).not.toHaveBeenCalled();
  });

  it("handles label-add failure gracefully", async () => {
    octokit.rest.issues.addLabels.mockRejectedValue(
      new Error("permission denied")
    );

    const url = await createDocsPR({
      octokit,
      owner: "org",
      repo: "docs",
      baseBranch: "main",
      prLabel: "docpr",
      sourcePR,
      updates,
    });

    expect(url).toBe("https://github.com/org/docs/pull/99");
  });
});

describe("buildPRBody", () => {
  it("includes source PR information", () => {
    const body = buildPRBody({ sourcePR, updates });

    expect(body).toContain("org/code#42");
    expect(body).toContain("https://github.com/org/code/pull/42");
    expect(body).toContain("Add new API endpoint");
  });

  it("lists all updated files", () => {
    const body = buildPRBody({ sourcePR, updates });

    expect(body).toContain("`docs/api.md`");
    expect(body).toContain("`docs/config.md`");
  });

  it("includes reasons when provided", () => {
    const body = buildPRBody({ sourcePR, updates });

    expect(body).toContain("Updated to reflect code changes");
  });

  it("omits reason dash when reason is empty", () => {
    const body = buildPRBody({
      sourcePR,
      updates: [{ ...updates[0], reason: "" }],
    });

    expect(body).not.toContain(" — ");
  });
});
