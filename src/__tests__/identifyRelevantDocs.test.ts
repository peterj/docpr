import { describe, it, expect, vi } from "vitest";
import { identifyRelevantDocs } from "../analysis/identifyRelevantDocs";
import type { LLMClient } from "../llm";

function createMockLLM(responseText: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue(responseText),
  };
}

describe("identifyRelevantDocs", () => {
  it("returns empty array for empty docFilePaths", async () => {
    const llm = createMockLLM("[]");
    const result = await identifyRelevantDocs({
      llm,
      model: "claude-opus-4-5",
      changeAnalysis: "Some changes",
      docFilePaths: [],
    });

    expect(result).toEqual([]);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it("parses a clean JSON array response", async () => {
    const llm = createMockLLM('["docs/api.md", "docs/config.md"]');

    const result = await identifyRelevantDocs({
      llm,
      model: "claude-opus-4-5",
      changeAnalysis: "Added new API endpoint",
      docFilePaths: [
        "docs/api.md",
        "docs/config.md",
        "docs/getting-started.md",
      ],
    });

    expect(result).toEqual(["docs/api.md", "docs/config.md"]);
  });

  it("parses JSON wrapped in code fences", async () => {
    const llm = createMockLLM('```json\n["docs/api.md"]\n```');

    const result = await identifyRelevantDocs({
      llm,
      model: "claude-opus-4-5",
      changeAnalysis: "Changes",
      docFilePaths: ["docs/api.md", "docs/guide.md"],
    });

    expect(result).toEqual(["docs/api.md"]);
  });

  it("filters out paths not in the allowed list", async () => {
    const llm = createMockLLM(
      '["docs/api.md", "docs/UNKNOWN.md", "docs/guide.md"]'
    );

    const result = await identifyRelevantDocs({
      llm,
      model: "claude-opus-4-5",
      changeAnalysis: "Changes",
      docFilePaths: ["docs/api.md", "docs/guide.md"],
    });

    expect(result).toEqual(["docs/api.md", "docs/guide.md"]);
  });

  it("filters out non-string values in the array", async () => {
    const llm = createMockLLM('["docs/api.md", 42, null, true]');

    const result = await identifyRelevantDocs({
      llm,
      model: "claude-opus-4-5",
      changeAnalysis: "Changes",
      docFilePaths: ["docs/api.md"],
    });

    expect(result).toEqual(["docs/api.md"]);
  });

  it("returns empty array when LLM returns a non-array JSON value", async () => {
    const llm = createMockLLM('{"paths": ["docs/api.md"]}');

    const result = await identifyRelevantDocs({
      llm,
      model: "claude-opus-4-5",
      changeAnalysis: "Changes",
      docFilePaths: ["docs/api.md"],
    });

    expect(result).toEqual([]);
  });

  it("falls back to heuristic matching when JSON parsing fails", async () => {
    const llm = createMockLLM(
      "I think docs/api.md and docs/config.md need updating"
    );

    const result = await identifyRelevantDocs({
      llm,
      model: "claude-opus-4-5",
      changeAnalysis: "Changes",
      docFilePaths: ["docs/api.md", "docs/config.md", "docs/faq.md"],
    });

    expect(result).toEqual(["docs/api.md", "docs/config.md"]);
  });

  it("returns empty array when LLM says no files need updating", async () => {
    const llm = createMockLLM("[]");

    const result = await identifyRelevantDocs({
      llm,
      model: "claude-opus-4-5",
      changeAnalysis: "Minor internal refactor",
      docFilePaths: ["docs/api.md"],
    });

    expect(result).toEqual([]);
  });

  it("passes correct prompt structure to the LLM", async () => {
    const llm = createMockLLM("[]");

    await identifyRelevantDocs({
      llm,
      model: "claude-opus-4-5",
      changeAnalysis: "New feature added",
      docFilePaths: ["docs/one.md", "docs/two.md"],
    });

    const call = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.system).toContain("JSON array");
    expect(call.messages[0].content).toContain("1. docs/one.md");
    expect(call.messages[0].content).toContain("2. docs/two.md");
    expect(call.messages[0].content).toContain("New feature added");
  });
});
