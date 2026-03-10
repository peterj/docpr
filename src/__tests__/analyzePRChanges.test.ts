import { describe, it, expect, vi } from "vitest";
import { analyzePRChanges } from "../analysis/analyzePRChanges";
import type { LLMClient } from "../llm";

function createMockLLM(responseText: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue(responseText),
  };
}

describe("analyzePRChanges", () => {
  it("returns the LLM text response", async () => {
    const llm = createMockLLM("## Summary\nAdded a new endpoint.");

    const result = await analyzePRChanges({
      llm,
      model: "claude-opus-4-5",
      prTitle: "Add /users endpoint",
      prBody: "Adds CRUD for users",
      diff: "+app.get('/users', handler)",
    });

    expect(result).toBe("## Summary\nAdded a new endpoint.");
  });

  it("passes correct parameters to the LLM", async () => {
    const llm = createMockLLM("analysis");

    await analyzePRChanges({
      llm,
      model: "claude-sonnet-4-20250514",
      prTitle: "Fix bug",
      prBody: "Fixes #123",
      diff: "-old\n+new",
    });

    const call = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-20250514");
    expect(call.maxTokens).toBe(2048);
    expect(call.system).toContain("senior software engineer");
    expect(call.messages[0].content).toContain("Fix bug");
    expect(call.messages[0].content).toContain("Fixes #123");
    expect(call.messages[0].content).toContain("-old\n+new");
  });

  it("uses placeholder when prBody is empty", async () => {
    const llm = createMockLLM("result");

    await analyzePRChanges({
      llm,
      model: "claude-opus-4-5",
      prTitle: "Test",
      prBody: "",
      diff: "diff content",
    });

    const content = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0]
      .messages[0].content;
    expect(content).toContain("(no description provided)");
  });
});
