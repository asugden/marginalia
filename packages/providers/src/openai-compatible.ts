// OpenAICompatibleProvider — talks the OpenAI Chat Completions wire format over
// fetch. One adapter covers OpenAI itself plus every gateway and self-hosted
// runtime that speaks the same shape: LiteLLM, Ollama, vLLM, OpenRouter,
// Together, Groq, and most institutional AI gateways.
//
// This is the highest-leverage adapter in the set, which is why it stays
// strictly generic: no vendor is named, and nothing here assumes which model
// family sits behind `baseUrl`. A deployment may point it at a gateway that
// proxies several vendors at once, so model ids are treated as OPAQUE strings —
// never parsed, normalized, or pattern-matched. Gateways commonly rewrite ids
// into their own namespaced form, and those forms are not consistent even
// within one vendor's lineup.

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

const DEFAULT_MAX_TOKENS = 1024;

export interface OpenAICompatibleConfig {
  apiKey: string;
  /**
   * Endpoint root, with or without a trailing `/v1`. Both
   * "https://gateway.example.edu" and "https://gateway.example.edu/v1"
   * resolve to the same Chat Completions URL.
   */
  baseUrl: string;
  /** Default model id when a request doesn't name one. Required — no sensible fallback exists. */
  model: string;
  /**
   * Cheapest model id for incidental work (title generation). Omit when the
   * endpoint has no cheaper tier; callers skip that work rather than paying
   * full price for it.
   */
  titleModel?: string;
  /** Reported as `provider` on errors, for log/telemetry attribution. */
  label?: string;
}

/**
 * Join the configured root with the Chat Completions path, tolerating an
 * optional trailing slash and an optional `/v1` the operator already included.
 */
function completionsUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  return /\/v\d+$/.test(root)
    ? `${root}/chat/completions`
    : `${root}/v1/chat/completions`;
}

/**
 * OpenAI format carries the system prompt as the first message rather than a
 * top-level field. The two SystemPrompt halves are joined into one system
 * message: the format has no per-block cache_control equivalent, so there is
 * no placement decision to preserve here (see `capabilities.promptCaching`).
 */
function toMessages(system: SystemPrompt, messages: Message[]) {
  const system_text = system.context
    ? `${system.instructions}\n\n${system.context}`
    : system.instructions;
  return [
    { role: "system", content: system_text },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

/**
 * Map OpenAI usage onto TokenUsage.
 *
 * Note on reasoning models: `completion_tokens` is the total billed output and
 * on a thinking model most of it can be reasoning rather than visible text
 * (`completion_tokens_details.reasoning_tokens`). We deliberately report the
 * total, because that is what the deployment is charged for. TokenUsage has no
 * field to separate the two, so a caller cannot currently distinguish "thought
 * a lot" from "wrote a lot" — accurate for cost, lossy for analytics.
 */
function toUsage(raw: any): TokenUsage | undefined {
  if (!raw) return undefined;
  return {
    inputTokens: raw.prompt_tokens ?? 0,
    outputTokens: raw.completion_tokens ?? 0,
  };
}

function toStopReason(reason: unknown): ChatResponse["stopReason"] {
  // "stop" = ran to completion; "length" = hit the max_tokens ceiling.
  if (reason === "stop") return "end";
  if (reason === "length") return "max_tokens";
  return "other";
}

/**
 * Extract assistant text from a choice.
 *
 * `content` is legitimately null in two cases worth handling rather than
 * crashing on: a reasoning model that spent its whole budget thinking before
 * emitting any text (paired with finish_reason "length"), and a content filter
 * that suppressed the message. Both are empty results, not transport failures,
 * so they surface as "" and let the stop reason carry the explanation.
 */
function textOf(choice: any): string {
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  // Some gateways return the multi-part content array shape instead of a string.
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p?.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("");
  }
  return "";
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    // The Chat Completions format has no request-side cache-control primitive.
    // Some gateways apply caching transparently and even report hit counts, but
    // this adapter cannot *request* it, so it does not advertise the
    // capability. Core code must keep degrading gracefully.
    promptCaching: false,
    streaming: true,
    embeddings: false,
  };

  constructor(private readonly config: OpenAICompatibleConfig) {
    if (!config.apiKey) {
      throw new ProviderError(
        "Missing API key",
        config.label ?? "openai-compatible",
      );
    }
    if (!config.baseUrl) {
      throw new ProviderError(
        "Missing base URL",
        config.label ?? "openai-compatible",
      );
    }
    if (!config.model) {
      throw new ProviderError(
        "Missing default model id",
        config.label ?? "openai-compatible",
      );
    }
    this.name = config.label ?? "openai-compatible";
  }

  titleModel(): string {
    // Falls back to the chat model when no cheaper tier is configured: callers
    // treat a present titleModel() as "incidental work is affordable", and the
    // factory omits this method entirely when it isn't.
    return this.config.titleModel ?? this.config.model;
  }

  private body(messages: Message[], opts: ChatOptions, stream: boolean) {
    return JSON.stringify({
      model: opts.model ?? this.config.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature,
      messages: toMessages(opts.system, messages),
      stream,
      // Ask for usage on the final SSE frame; without this most servers omit
      // token counts entirely when streaming.
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    });
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private async fail(res: Response): Promise<never> {
    const text = await res.text().catch(() => "");
    // 429 and 5xx are worth retrying; 4xx (bad key, bad model id, bad request)
    // are not. A gateway rejecting an unknown model id lands here as a 4xx.
    const retryable = res.status === 429 || res.status >= 500;
    throw new ProviderError(
      `${this.name} API ${res.status}: ${text.slice(0, 500)}`,
      this.name,
      res.status,
      retryable,
    );
  }

  async chat(messages: Message[], opts: ChatOptions): Promise<ChatResponse> {
    const res = await fetch(completionsUrl(this.config.baseUrl), {
      method: "POST",
      headers: this.headers(),
      body: this.body(messages, opts, false),
      signal: opts.signal,
    });
    if (!res.ok) await this.fail(res);

    const data: any = await res.json();
    // Some gateways return HTTP 200 with an error object in the body rather
        // than a non-2xx status; treat that as a provider failure, not as an
    // empty completion.
    if (data?.error) {
      const msg =
        typeof data.error === "string"
          ? data.error
          : (data.error.message ?? JSON.stringify(data.error));
      throw new ProviderError(
        `${this.name}: ${String(msg).slice(0, 500)}`,
        this.name,
      );
    }

    const choice = (data.choices ?? [])[0];
    return {
      content: textOf(choice),
      usage: toUsage(data.usage),
      stopReason: toStopReason(choice?.finish_reason),
    };
  }

  async *stream(messages: Message[], opts: ChatOptions): AsyncIterable<Chunk> {
    const res = await fetch(completionsUrl(this.config.baseUrl), {
      method: "POST",
      headers: this.headers(),
      body: this.body(messages, opts, true),
      signal: opts.signal,
    });
    if (!res.ok) await this.fail(res);
    if (!res.body) {
      throw new ProviderError("Empty stream body", this.name);
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let usage: TokenUsage | undefined;
    let sawDone = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE events are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;

        const payload = dataLine.slice(5).trim();
        // Terminal sentinel. Usage, when requested, arrives on the frame just
        // before this one.
        if (payload === "[DONE]") {
          sawDone = true;
          continue;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(payload);
        } catch {
          // Keep-alive or comment frame with no JSON body; skip rather than
          // tearing down a working stream.
          continue;
        }

        // Usage-only frames carry an empty choices array.
        if (parsed.usage) usage = toUsage(parsed.usage);

        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield { delta };
        }
      }
    }

    // Always emit a terminal chunk so consumers can commit usage, whether the
    // server sent [DONE] or simply closed the connection.
    void sawDone;
    yield { delta: "", usage, done: true };
  }
}
