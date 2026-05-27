// Core LLM provider abstraction. Normalize on OpenAI-style messages internally;
// each adapter translates at its own edge. No vendor SDK types leak past this file.

export type Role = "user" | "assistant";

/** A conversation turn. The system prompt is NOT a message — see SystemPrompt. */
export interface Message {
  role: Role;
  content: string;
}

/**
 * System prompt as a structured object, never a bare string passed around.
 * Providers decide their own placement (top-level field, first message, etc.).
 */
export interface SystemPrompt {
  /** Stable instructions — persona, format rules. Eligible for prompt caching. */
  instructions: string;
  /** Volatile per-turn context — backbone state, retrieved chunks. Not cached. */
  context?: string;
}

export interface ChatOptions {
  system: SystemPrompt;
  /** Hard cap on generated tokens. */
  maxTokens?: number;
  temperature?: number;
  /** Provider model id, e.g. "claude-opus-4-7". */
  model?: string;
  /** Abort in-flight requests (request cancellation, timeouts). */
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResponse {
  content: string;
  usage?: TokenUsage;
  /** Provider-reported stop reason, normalized loosely. */
  stopReason?: "end" | "max_tokens" | "other";
}

/** Streaming delta. Most chunks are text; the final chunk may carry usage. */
export interface Chunk {
  delta: string;
  usage?: TokenUsage;
  done?: boolean;
}

/**
 * Optional capabilities advertised by an adapter. Core code must degrade
 * gracefully when a capability is absent — never hard-depend on one.
 */
export interface ProviderCapabilities {
  promptCaching: boolean;
  streaming: boolean;
  embeddings: boolean;
}

export interface LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  chat(messages: Message[], opts: ChatOptions): Promise<ChatResponse>;
  stream(messages: Message[], opts: ChatOptions): AsyncIterable<Chunk>;
  /** Embeddings are pluggable independently from generation; optional. */
  embed?(texts: string[]): Promise<number[][]>;
  /**
   * Cheapest model id on this provider, used for incidental work (lazy title
   * generation, etc.) where we explicitly do NOT want to spend the agent's
   * configured model budget. Optional — callers must skip the work when absent.
   */
  titleModel?(): string;
}

/** Thrown by adapters for any provider-side failure, with a normalized shape. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
