// The `state` parameter we round-trip through the IdP and the `oidc_state`
// cookie. Carries the PKCE code verifier, the in-app return path, and a
// nonce.
//
// We HMAC-SHA256 sign the JSON over a per-instance secret so a tampered
// state cookie can't be substituted by an attacker who controls the user's
// browser (or a coffeeshop network seeing the redirect query string).
// Without the signature, an attacker who can write to `oidc_state` could
// replace the verifier with one they control, defeating PKCE.

import type { AuthState } from "./types.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64urlEncode(bytes: Uint8Array): string {
  // Workers have `btoa`; convert bytes via a binary string. Length < 1024
  // for everything we sign here so the chunked-codePointAt dance other code
  // uses isn't needed.
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Encode an AuthState as `<base64url(json)>.<base64url(hmac)>`. The HMAC is
 * over the JSON bytes only; substituting the JSON without re-signing fails
 * verifyState below.
 */
export async function signState(
  state: AuthState,
  secret: string,
): Promise<string> {
  const json = enc.encode(JSON.stringify(state));
  const key = await hmacKey(secret);
  const sigBuf = await crypto.subtle.sign("HMAC", key, json);
  return `${base64urlEncode(json)}.${base64urlEncode(new Uint8Array(sigBuf))}`;
}

/**
 * Decode + verify. Returns null on any failure (bad shape, bad signature,
 * bad JSON, missing required fields). Caller treats null as "invalid state"
 * and 4xx's.
 */
export async function verifyState(
  signed: string,
  secret: string,
): Promise<AuthState | null> {
  const dot = signed.indexOf(".");
  if (dot < 0) return null;
  const jsonB64 = signed.slice(0, dot);
  const sigB64 = signed.slice(dot + 1);
  let jsonBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    jsonBytes = base64urlDecode(jsonB64);
    sigBytes = base64urlDecode(sigB64);
  } catch {
    return null;
  }
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as BufferSource,
    jsonBytes as BufferSource,
  );
  if (!ok) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(dec.decode(jsonBytes));
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as AuthState).nonce !== "string" ||
    typeof (parsed as AuthState).returnTo !== "string" ||
    typeof (parsed as AuthState).codeVerifier !== "string"
  ) {
    return null;
  }
  return parsed as AuthState;
}

/**
 * PKCE: generate a high-entropy verifier and its S256 challenge. The
 * verifier rides the signed state cookie; the challenge goes to the IdP
 * over the wire.
 */
export async function newPkcePair(): Promise<{
  verifier: string;
  challenge: string;
}> {
  // RFC 7636 §4.1: 43–128 chars from [A-Z][a-z][0-9]-._~. base64url of
  // 32 random bytes is 43 chars and well within range.
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = base64urlEncode(verifierBytes);
  const challengeBuf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(verifier),
  );
  return {
    verifier,
    challenge: base64urlEncode(new Uint8Array(challengeBuf)),
  };
}

/** A 256-bit random nonce, base64url-encoded. */
export function newNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}
