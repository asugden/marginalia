// Provider selection. Call sites ask for a provider and get whichever adapter
// the deployment configured; they never name a vendor themselves.
//
// Two distinct paths exist here, and conflating them is a real hazard:
//
//   instanceProvider() — the shared, institution-funded path. Uses whatever
//     provider the deployment configured (LLM_PROVIDER), which may be a gateway
//     proxying several model vendors.
//
//   userKeyProvider() — a bring-your-own-key path, where an end user supplies
//     their own credential so the institution isn't billed. This MUST go direct
//     to the vendor: a user's vendor-issued key is not valid at an institutional
//     gateway (gateways issue their own keys and look them up in their own
//     store), and routing it through one would both fail to authenticate and
//     bill the institution for usage the user intended to self-fund.

import { AnthropicProvider } from "./anthropic.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { ProviderError, type LLMProvider } from "./types.js";

/** Provider-selection config, read from deployment vars by the caller. */
export interface ProviderConfig {
  /** Which adapter to construct: "anthropic" | "openai-compatible". */
  provider?: string;
  /** Credential for the configured provider. */
  apiKey?: string;
  /** Endpoint root. Required for "openai-compatible"; ignored otherwise. */
  baseUrl?: string;
  /** Default model id when neither the agent nor the request names one. */
  defaultModel?: string;
  /** Cheapest model id for incidental work. Omit to disable that work. */
  titleModel?: string;
  /** Attribution label for errors and logs. */
  label?: string;
}

export type ProviderName = "anthropic" | "openai-compatible";

/** Normalize the configured provider name, defaulting to Anthropic-direct. */
export function resolveProviderName(raw?: string): ProviderName {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "openai-compatible" || v === "openai") return "openai-compatible";
  if (v === "anthropic" || v === "") return "anthropic";
  throw new ProviderError(`Unknown LLM_PROVIDER: ${raw}`, "factory");
}

/**
 * Build the provider for institution-funded requests.
 *
 * `model` is the caller's resolved choice — typically the per-agent override
 * falling back to the deployment default. It is passed through as an opaque
 * string; this layer never validates it against a known list, because the set
 * of valid ids is a property of the configured endpoint, not of this code.
 */
export function instanceProvider(
  cfg: ProviderConfig,
  model?: string,
): LLMProvider {
  const name = resolveProviderName(cfg.provider);
  const resolvedModel = model ?? cfg.defaultModel;

  if (name === "openai-compatible") {
    if (!cfg.apiKey) {
      throw new ProviderError("LLM provider key not configured", "factory");
    }
    if (!cfg.baseUrl) {
      throw new ProviderError("LLM provider base URL not configured", "factory");
    }
    if (!resolvedModel) {
      throw new ProviderError("No model configured", "factory");
    }
    return new OpenAICompatibleProvider({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      model: resolvedModel,
      titleModel: cfg.titleModel,
      label: cfg.label ?? "openai-compatible",
    });
  }

  if (!cfg.apiKey) {
    throw new ProviderError("LLM provider key not configured", "factory");
  }
  return new AnthropicProvider({ apiKey: cfg.apiKey, model: resolvedModel });
}

/**
 * Build a provider for a user-supplied key. Always Anthropic-direct — see the
 * header note on why this must not follow LLM_PROVIDER.
 *
 * The key is used for this request only: never persisted, never logged, and
 * never echoed back in an error message.
 *
 * IMPORTANT: do not pass the deployment's default model here. When the instance
 * is configured against a gateway, that id is in the gateway's own namespace
 * and does not exist at the vendor's own API — forwarding it would 404 on every
 * BYO request. Pass a vendor-native id, or omit it and let the adapter use its
 * own built-in default.
 */
export function userKeyProvider(apiKey: string, model?: string): LLMProvider {
  if (!apiKey) {
    throw new ProviderError("Missing user-supplied key", "anthropic");
  }
  return new AnthropicProvider({ apiKey, model });
}
