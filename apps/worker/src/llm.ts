// Maps deployment vars onto the providers package's ProviderConfig, so the
// Env → config translation lives in exactly one place.

import {
  instanceProvider,
  userKeyProvider,
  type LLMProvider,
  type ProviderConfig,
} from "@marginalia/providers";
import type { Env } from "./env.js";

/** Model an instructor may assign to an agent. */
export interface ModelChoice {
  id: string;
  label: string;
}

/**
 * Read the OpenAI-compatible credential. Normally that's LLM_API_KEY, but a
 * deployment whose institution mandates a specific secret name can point
 * LLM_API_KEY_VAR at it — keeping local naming conventions out of this
 * brand-neutral codebase.
 */
function openAiCompatibleKey(env: Env): string | undefined {
  const alias = env.LLM_API_KEY_VAR?.trim();
  if (alias) {
    const viaAlias = (env as unknown as Record<string, unknown>)[alias];
    if (typeof viaAlias === "string" && viaAlias) return viaAlias;
    console.warn(`LLM_API_KEY_VAR names "${alias}", but it is unset or empty`);
  }
  return env.LLM_API_KEY;
}

function providerConfig(env: Env): ProviderConfig {
  const provider = env.LLM_PROVIDER ?? "anthropic";
  const usingGateway = provider !== "anthropic";
  return {
    provider,
    // The OpenAI-compatible path has its own credential so a deployment can
    // route shared traffic through a gateway while still keeping an
    // Anthropic-direct key around for the bring-your-own-key fallback.
    apiKey: usingGateway ? openAiCompatibleKey(env) : env.ANTHROPIC_API_KEY,
    baseUrl: env.LLM_BASE_URL,
    defaultModel: env.DEFAULT_MODEL,
    titleModel: env.TITLE_MODEL,
    label: usingGateway ? "gateway" : "anthropic",
  };
}

/**
 * Provider for institution-funded requests. `model` is the caller's resolved
 * choice (typically a per-agent override falling back to DEFAULT_MODEL) and is
 * passed through opaquely — the configured endpoint is the authority on which
 * ids are valid, not this code.
 */
export function providerFor(env: Env, model?: string): LLMProvider {
  return instanceProvider(providerConfig(env), model);
}

/**
 * Provider for a user-supplied key. Always goes direct to the vendor, never
 * through the configured gateway — see userKeyProvider() for why.
 *
 * Note the deliberate absence of a model argument: DEFAULT_MODEL may be a
 * gateway-namespaced id that does not exist at the vendor's own API, so the
 * adapter's built-in default is used instead.
 */
export function providerForUserKey(apiKey: string): LLMProvider {
  return userKeyProvider(apiKey);
}

/** True when the deployment has some way to serve institution-funded requests. */
export function llmConfigured(env: Env): boolean {
  const provider = env.LLM_PROVIDER ?? "anthropic";
  return provider === "anthropic"
    ? Boolean(env.ANTHROPIC_API_KEY)
    : Boolean(openAiCompatibleKey(env) && env.LLM_BASE_URL);
}

/**
 * Default model for provenance chat: the floor applied when a voice names no
 * model, and for the built-in voices, which have no row to hold a choice.
 * Falls back to DEFAULT_MODEL when PROVENANCE_DEFAULT_MODEL is unset.
 */
export function provenanceDefaultModel(env: Env): string | undefined {
  return env.PROVENANCE_DEFAULT_MODEL?.trim() || env.DEFAULT_MODEL;
}

/**
 * Whether `model` may be assigned to a provenance voice. Mirrors the tutoring
 * side's rule: authors don't get to type free-form model strings and quietly
 * upgrade themselves to an expensive tier.
 *
 * The provenance default is always permitted — it's what an unset voice uses,
 * so rejecting it would be incoherent. When LLM_MODELS is unset this allows
 * only that default, failing closed rather than opening choice up.
 */
export function provenanceModelAllowed(env: Env, model: string): boolean {
  if (model === provenanceDefaultModel(env)) return true;
  return modelChoices(env).some((m) => m.id === model);
}

/**
 * Models an author may pick from, parsed from LLM_MODELS. Returns [] when
 * unset or malformed — callers fall back to the configured default, so a bad
 * value degrades to single-model behavior rather than breaking authoring.
 */
export function modelChoices(env: Env): ModelChoice[] {
  if (!env.LLM_MODELS?.trim()) return [];
  try {
    const parsed = JSON.parse(env.LLM_MODELS);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((m: unknown) => {
      if (typeof m !== "object" || m === null) return [];
      const { id, label } = m as Record<string, unknown>;
      if (typeof id !== "string" || !id.trim()) return [];
      return [{ id, label: typeof label === "string" && label ? label : id }];
    });
  } catch {
    console.warn("LLM_MODELS is not valid JSON; model picker disabled");
    return [];
  }
}
