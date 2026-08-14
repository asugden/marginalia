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
 * choice — typically an agent's stored `definition.model`.
 *
 * A stored id is only valid relative to the endpoint that was configured when
 * an author picked it. Repointing the deployment (vendor-direct → gateway, or
 * one gateway to another) silently invalidates every id already persisted on
 * an agent, because those rows are not rewritten by the config change. The
 * request then fails at the provider with an opaque 403/404 and the student
 * sees a dead agent — a config change in one place breaking content authored
 * in another.
 *
 * So an unrecognised id degrades to the deployment default instead of being
 * forwarded. Authors keep a working agent through a migration, and the warning
 * gives an operator the thread to pull to fix the stored value. Ids are only
 * checked when the deployment actually publishes a list (LLM_MODELS): with no
 * list there is nothing to validate against, and passing the id through
 * unchanged preserves the documented "endpoint is the authority" behaviour.
 */
export function providerFor(env: Env, model?: string): LLMProvider {
  return instanceProvider(providerConfig(env), servableModel(env, model));
}

/**
 * Map a requested model id onto one this deployment can actually serve,
 * falling back to DEFAULT_MODEL when it can't. Returns the input untouched
 * when there is no configured list to check against.
 */
function servableModel(env: Env, model?: string): string | undefined {
  if (!model) return model;
  const choices = modelChoices(env);
  if (choices.length === 0) return model; // nothing to validate against
  if (choices.some((m) => m.id === model)) return model;
  // Both configured defaults are servable by definition — they're what an
  // unset agent/voice already runs on. A deployment may legitimately point
  // PROVENANCE_DEFAULT_MODEL at a cheap model it deliberately keeps out of
  // the author-facing picker, so neither default is required to appear in
  // LLM_MODELS and neither may be rewritten.
  if (model === env.DEFAULT_MODEL) return model;
  if (model === env.PROVENANCE_DEFAULT_MODEL) return model;
  console.warn(
    `Model "${model}" is not servable by this deployment; ` +
      `falling back to DEFAULT_MODEL. An agent likely stores an id from a ` +
      `previously-configured provider.`,
  );
  return env.DEFAULT_MODEL;
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
