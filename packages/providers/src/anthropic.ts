// AnthropicProvider — talks to the Messages API over fetch. No @anthropic-ai/sdk:
// keeps the Worker bundle small and confines all Anthropic specifics to this file.

import {
  ProviderError,
  type Chunk,
  type ChatOptions,
  type ChatResponse,
  type LLMProvider,
  type Message,
  type ProviderCapabilities,
  type SystemPrompt,
  type TokenUsage,
} from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1024;
/** Cheapest Anthropic model for incidental calls like title generation. */
const TITLE_MODEL = "claude-haiku-4-5-20251001";

export interface AnthropicConfig {
  apiKey: string;
  /** Override the default model for this provider instance. */
  model?: string;
}

/**
 * Anthropic's `system` field accepts an array of blocks; marking the stable
 * instructions block with cache_control turns on prompt caching. The volatile
 * context block is left uncached so per-turn backbone state doesn't bust it.
 */
function buildSystem(system: SystemPrompt): unknown[] {
  const blocks: unknown[] = [
    {
      type: "text",
      text: system.instructions,
      cache_control: { type: "ephemeral" },
    },
  ];
  if (system.context) {
    blocks.push({ type: "text", text: system.context });
  }
  return blocks;
}

function toUsage(raw: any): TokenUsage | undefined {
  if (!raw) return undefined;
  return {
    inputTokens: (raw.input_tokens ?? 0) + (raw.cache_read_input_tokens ?? 0),
    outputTokens: raw.output_tokens ?? 0,
  };
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly capabilities: ProviderCapabilities = {
    promptCaching: true,
    streaming: true,
    embeddings: false,
  };

  constructor(private readonly config: AnthropicConfig) {
    if (!config.apiKey) {
      throw new ProviderError("Missing Anthropic API key", "anthropic");
    }
  }

  titleModel(): string {
    return TITLE_MODEL;
  }

  private body(messages: Message[], opts: ChatOptions, stream: boolean) {
    return JSON.stringify({
      model: opts.model ?? this.config.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature,
      system: buildSystem(opts.system),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream,
    });
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "anthropic-version": API_VERSION,
      "x-api-key": this.config.apiKey,
    };
  }

  private async fail(res: Response): Promise<never> {
    const text = await res.text().catch(() => "");
    // 429 and 5xx are worth retrying; 4xx (bad key, bad request) are not.
    const retryable = res.status === 429 || res.status >= 500;
    throw new ProviderError(
      `Anthropic API ${res.status}: ${text.slice(0, 500)}`,
      "anthropic",
      res.status,
      retryable,
    );
  }

  async chat(messages: Message[], opts: ChatOptions): Promise<ChatResponse> {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: this.headers(),
      body: this.body(messages, opts, false),
      signal: opts.signal,
    });
    if (!res.ok) await this.fail(res);

    const data: any = await res.json();
    const content = (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    return {
      content,
      usage: toUsage(data.usage),
      stopReason:
        data.stop_reason === "end_turn"
          ? "end"
          : data.stop_reason === "max_tokens"
            ? "max_tokens"
            : "other",
    };
  }

  async *stream(messages: Message[], opts: ChatOptions): AsyncIterable<Chunk> {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: this.headers(),
      body: this.body(messages, opts, true),
      signal: opts.signal,
    });
    if (!res.ok) await this.fail(res);
    if (!res.body) {
      throw new ProviderError("Empty stream body", "anthropic");
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let usage: TokenUsage | undefined;
    // Input tokens arrive on `message_start`; output tokens stream on
    // `message_delta`. Track them separately so the final usage carries both,
    // not just whichever event fired last.
    let inputTokens = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE events are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        const dataLine = event
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;

        let payload: any;
        try {
          payload = JSON.parse(dataLine.slice(5).trim());
        } catch {
          // Anthropic occasionally emits keep-alive `ping` events with no
          // JSON payload; skip silently rather than tearing down the stream.
          continue;
        }
        if (payload.type === "message_start" && payload.message?.usage) {
          const u = payload.message.usage;
          inputTokens =
            (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        } else if (payload.type === "content_block_delta" && payload.delta?.text) {
          yield { delta: payload.delta.text };
        } else if (payload.type === "message_delta" && payload.usage) {
          usage = {
            inputTokens,
            outputTokens: payload.usage.output_tokens ?? 0,
          };
        } else if (payload.type === "message_stop") {
          yield { delta: "", usage, done: true };
        }
      }
    }
  }
}
