import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAnthropicCreate = vi.fn();
const mockOpenAICreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockAnthropicCreate };
    constructor(_opts: any) {}
  },
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mockOpenAICreate } };
    constructor(_opts: any) {}
  },
}));

import {
  AnthropicClient,
  OpenAIClient,
  createLLMClient,
  DEFAULT_MODELS,
  type ChatParams,
  type LLMProvider,
} from "../llm";

const sampleParams: ChatParams = {
  model: "test-model",
  maxTokens: 1024,
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello" }],
};

describe("AnthropicClient", () => {
  beforeEach(() => {
    mockAnthropicCreate.mockReset();
  });

  it("maps maxTokens to max_tokens", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
    });

    const client = new AnthropicClient("sk-ant-test");
    await client.chat(sampleParams);

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.max_tokens).toBe(1024);
    expect(call).not.toHaveProperty("maxTokens");
  });

  it("passes system as a top-level parameter", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
    });

    const client = new AnthropicClient("sk-ant-test");
    await client.chat(sampleParams);

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.system).toBe("You are a helpful assistant.");
    expect(call.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("passes model through unchanged", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "" }],
    });

    const client = new AnthropicClient("sk-ant-test");
    await client.chat(sampleParams);

    expect(mockAnthropicCreate.mock.calls[0][0].model).toBe("test-model");
  });

  it("extracts text from a single text block", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Single response" }],
    });

    const client = new AnthropicClient("sk-ant-test");
    const result = await client.chat(sampleParams);

    expect(result).toBe("Single response");
  });

  it("joins multiple text blocks with newline", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Part 1" },
        { type: "text", text: "Part 2" },
      ],
    });

    const client = new AnthropicClient("sk-ant-test");
    const result = await client.chat(sampleParams);

    expect(result).toBe("Part 1\nPart 2");
  });

  it("filters out non-text content blocks", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Real text" },
        { type: "tool_use", id: "x", name: "y", input: {} },
      ],
    });

    const client = new AnthropicClient("sk-ant-test");
    const result = await client.chat(sampleParams);

    expect(result).toBe("Real text");
  });

  it("returns empty string when no text blocks are present", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
    });

    const client = new AnthropicClient("sk-ant-test");
    const result = await client.chat(sampleParams);

    expect(result).toBe("");
  });
});

describe("OpenAIClient", () => {
  beforeEach(() => {
    mockOpenAICreate.mockReset();
  });

  it("maps maxTokens to max_tokens", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "hi" } }],
    });

    const client = new OpenAIClient("sk-test");
    await client.chat(sampleParams);

    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.max_tokens).toBe(1024);
    expect(call).not.toHaveProperty("maxTokens");
  });

  it("prepends system as a system message", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "hi" } }],
    });

    const client = new OpenAIClient("sk-test");
    await client.chat(sampleParams);

    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
    expect(call.messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("passes model through unchanged", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });

    const client = new OpenAIClient("sk-test");
    await client.chat(sampleParams);

    expect(mockOpenAICreate.mock.calls[0][0].model).toBe("test-model");
  });

  it("preserves message ordering after system", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });

    const client = new OpenAIClient("sk-test");
    await client.chat({
      ...sampleParams,
      messages: [
        { role: "user", content: "First" },
        { role: "assistant", content: "Response" },
        { role: "user", content: "Second" },
      ],
    });

    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.messages).toEqual([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "First" },
      { role: "assistant", content: "Response" },
      { role: "user", content: "Second" },
    ]);
  });

  it("extracts content from response", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "The answer is 42" } }],
    });

    const client = new OpenAIClient("sk-test");
    const result = await client.chat(sampleParams);

    expect(result).toBe("The answer is 42");
  });

  it("returns empty string when content is null", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const client = new OpenAIClient("sk-test");
    const result = await client.chat(sampleParams);

    expect(result).toBe("");
  });

  it("returns empty string when choices array is empty", async () => {
    mockOpenAICreate.mockResolvedValue({ choices: [] });

    const client = new OpenAIClient("sk-test");
    const result = await client.chat(sampleParams);

    expect(result).toBe("");
  });
});

describe("createLLMClient", () => {
  it("returns an AnthropicClient for 'anthropic'", () => {
    const client = createLLMClient("anthropic", "sk-ant-test");
    expect(client).toBeInstanceOf(AnthropicClient);
  });

  it("returns an OpenAIClient for 'openai'", () => {
    const client = createLLMClient("openai", "sk-test");
    expect(client).toBeInstanceOf(OpenAIClient);
  });

  it("throws for an unsupported provider", () => {
    expect(() => createLLMClient("gemini" as LLMProvider, "key")).toThrow(
      /Unsupported LLM provider: "gemini"/
    );
  });
});

describe("DEFAULT_MODELS", () => {
  it("has a default model for each provider", () => {
    expect(DEFAULT_MODELS.anthropic).toBe("claude-opus-4-5");
    expect(DEFAULT_MODELS.openai).toBe("gpt-4o");
  });
});
