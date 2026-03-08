import { describe, it, expect, vi } from "vitest";
import { analyzePRChanges } from "../claude/analyzePRChanges";

function createMockAnthropic(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
      }),
    },
  } as any;
}

describe("analyzePRChanges", () => {
  it("returns Claude's text response", async () => {
    const anthropic = createMockAnthropic("## Summary\nAdded a new endpoint.");

    const result = await analyzePRChanges({
      anthropic,
      model: "claude-opus-4-5",
      prTitle: "Add /users endpoint",
      prBody: "Adds CRUD for users",
      diff: "+app.get('/users', handler)",
    });

    expect(result).toBe("## Summary\nAdded a new endpoint.");
  });

  it("passes correct parameters to Claude", async () => {
    const anthropic = createMockAnthropic("analysis");

    await analyzePRChanges({
      anthropic,
      model: "claude-sonnet-4-20250514",
      prTitle: "Fix bug",
      prBody: "Fixes #123",
      diff: "-old\n+new",
    });

    const call = anthropic.messages.create.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-20250514");
    expect(call.max_tokens).toBe(2048);
    expect(call.system).toContain("senior software engineer");
    expect(call.messages[0].content).toContain("Fix bug");
    expect(call.messages[0].content).toContain("Fixes #123");
    expect(call.messages[0].content).toContain("-old\n+new");
  });

  it("joins multiple text blocks with newline", async () => {
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: "text", text: "Part 1" },
            { type: "text", text: "Part 2" },
          ],
        }),
      },
    } as any;

    const result = await analyzePRChanges({
      anthropic,
      model: "claude-opus-4-5",
      prTitle: "Test",
      prBody: "",
      diff: "diff",
    });

    expect(result).toBe("Part 1\nPart 2");
  });

  it("filters out non-text content blocks", async () => {
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: "text", text: "Real analysis" },
            { type: "tool_use", id: "x", name: "y", input: {} },
          ],
        }),
      },
    } as any;

    const result = await analyzePRChanges({
      anthropic,
      model: "claude-opus-4-5",
      prTitle: "Test",
      prBody: "",
      diff: "diff",
    });

    expect(result).toBe("Real analysis");
  });

  it("uses placeholder when prBody is empty", async () => {
    const anthropic = createMockAnthropic("result");

    await analyzePRChanges({
      anthropic,
      model: "claude-opus-4-5",
      prTitle: "Test",
      prBody: "",
      diff: "diff content",
    });

    const content = anthropic.messages.create.mock.calls[0][0].messages[0].content;
    expect(content).toContain("(no description provided)");
  });
});
