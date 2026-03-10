import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type LLMProvider = "anthropic" | "openai";

export interface ChatParams {
  model: string;
  maxTokens: number;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface LLMClient {
  chat(params: ChatParams): Promise<string>;
}

export class AnthropicClient implements LLMClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat({
    model,
    maxTokens,
    system,
    messages,
  }: ChatParams): Promise<string> {
    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    });

    return response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
}

export class OpenAIClient implements LLMClient {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat({
    model,
    maxTokens,
    system,
    messages,
  }: ChatParams): Promise<string> {
    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system" as const, content: system },
        ...messages,
      ],
    });

    return response.choices[0]?.message?.content ?? "";
  }
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-opus-4-5",
  openai: "gpt-4o",
};

export function createLLMClient(
  provider: LLMProvider,
  apiKey: string
): LLMClient {
  switch (provider) {
    case "anthropic":
      return new AnthropicClient(apiKey);
    case "openai":
      return new OpenAIClient(apiKey);
    default:
      throw new Error(
        `Unsupported LLM provider: "${provider}". Supported: anthropic, openai.`
      );
  }
}
