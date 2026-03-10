import { describe, it, expect, vi } from "vitest";
import {
  generateDocUpdates,
  stripCodeFence,
} from "../analysis/generateDocUpdates";
import type { LLMClient } from "../llm";

function createMockLLM(responses: string[]): LLMClient {
  const chat = vi.fn();
  for (const text of responses) {
    chat.mockResolvedValueOnce(text);
  }
  return { chat };
}

describe("stripCodeFence", () => {
  it("removes markdown code fences", () => {
    const input = "```markdown\n# Title\nContent\n```";
    expect(stripCodeFence(input, "docs/guide.md")).toBe(
      "# Title\nContent\n"
    );
  });

  it("removes fences with the file extension as language", () => {
    const input = "```md\n# Hello\n```";
    expect(stripCodeFence(input, "readme.md")).toBe("# Hello\n");
  });

  it("removes fences with no language specified", () => {
    const input = "```\nSome content\n```";
    expect(stripCodeFence(input, "file.txt")).toBe("Some content\n");
  });

  it("leaves content without fences unchanged (plus trailing newline)", () => {
    const input = "# Title\nContent";
    expect(stripCodeFence(input, "file.md")).toBe("# Title\nContent\n");
  });

  it("handles rst extension", () => {
    const input = "```rst\nTitle\n=====\n```";
    expect(stripCodeFence(input, "docs/index.rst")).toBe("Title\n=====\n");
  });
});

describe("generateDocUpdates", () => {
  const baseParams = {
    model: "claude-opus-4-5",
    prTitle: "Add widget API",
    prBody: "New widget endpoints",
    prUrl: "https://github.com/org/repo/pull/42",
    changeAnalysis: "Added widget CRUD endpoints",
  };

  it("returns updates for docs that need changes", async () => {
    const llm = createMockLLM([
      "# Updated API\nNew widget section\n",
    ]);

    const result = await generateDocUpdates({
      ...baseParams,
      llm,
      relevantDocs: [
        {
          path: "docs/api.md",
          content: "# API\nExisting content\n",
          sha: "sha-1",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("docs/api.md");
    expect(result[0].content).toContain("Updated API");
    expect(result[0].originalSha).toBe("sha-1");
    expect(result[0].reason).toBe("Updated to reflect code changes");
  });

  it("skips docs where LLM returns NO_CHANGES_NEEDED", async () => {
    const llm = createMockLLM([
      "NO_CHANGES_NEEDED",
      "# Updated guide\n",
    ]);

    const result = await generateDocUpdates({
      ...baseParams,
      llm,
      relevantDocs: [
        {
          path: "docs/api.md",
          content: "# API\n",
          sha: "sha-1",
        },
        {
          path: "docs/guide.md",
          content: "# Guide\n",
          sha: "sha-2",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("docs/guide.md");
  });

  it("skips docs where response contains NO_CHANGES_NEEDED", async () => {
    const llm = createMockLLM([
      "After review, NO_CHANGES_NEEDED for this file.",
    ]);

    const result = await generateDocUpdates({
      ...baseParams,
      llm,
      relevantDocs: [
        {
          path: "docs/api.md",
          content: "# API\n",
          sha: "sha-1",
        },
      ],
    });

    expect(result).toHaveLength(0);
  });

  it("warns when updated content is significantly shorter", async () => {
    const originalContent = "x".repeat(500);
    const shortUpdate = "y".repeat(100);
    const llm = createMockLLM([shortUpdate]);

    const result = await generateDocUpdates({
      ...baseParams,
      llm,
      relevantDocs: [
        {
          path: "docs/api.md",
          content: originalContent,
          sha: "sha-1",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain("significantly shorter");
  });

  it("does not warn for short original documents", async () => {
    const llm = createMockLLM(["# Short\n"]);

    const result = await generateDocUpdates({
      ...baseParams,
      llm,
      relevantDocs: [
        {
          path: "docs/short.md",
          content: "# Old\nShort doc\n",
          sha: "sha-1",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("Updated to reflect code changes");
  });

  it("strips code fences from LLM response", async () => {
    const llm = createMockLLM([
      "```markdown\n# Updated\nContent\n```",
    ]);

    const result = await generateDocUpdates({
      ...baseParams,
      llm,
      relevantDocs: [
        {
          path: "docs/guide.md",
          content: "# Guide\nOld content\n",
          sha: "sha-1",
        },
      ],
    });

    expect(result[0].content).toBe("# Updated\nContent\n");
    expect(result[0].content).not.toContain("```");
  });

  it("returns empty array when all docs need no changes", async () => {
    const llm = createMockLLM([
      "NO_CHANGES_NEEDED",
      "NO_CHANGES_NEEDED",
    ]);

    const result = await generateDocUpdates({
      ...baseParams,
      llm,
      relevantDocs: [
        { path: "docs/a.md", content: "# A\n", sha: "s1" },
        { path: "docs/b.md", content: "# B\n", sha: "s2" },
      ],
    });

    expect(result).toEqual([]);
  });

  it("sends correct prompt to the LLM for each doc", async () => {
    const llm = createMockLLM(["# Updated\n"]);

    await generateDocUpdates({
      ...baseParams,
      llm,
      relevantDocs: [
        {
          path: "docs/api.md",
          content: "# API Reference\n",
          sha: "sha-1",
        },
      ],
    });

    const call = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.system).toContain("expert technical writer");
    expect(call.messages[0].content).toContain("Add widget API");
    expect(call.messages[0].content).toContain("docs/api.md");
    expect(call.messages[0].content).toContain("# API Reference");
  });
});
