// Worker entrypoint: API + LLM proxy + agent turn logic.
//
// Routes (all under /api):
//   GET  /api/me                            - identity + enrollment check
//   GET  /api/voices?courseId=              - library + course-defined voices
//   POST /api/voices                        - create a course-scoped custom voice
//   GET  /api/agents?courseId=              - list course agents (what student picks)
//   GET  /api/agents/:id?courseId=          - read one
//   POST /api/agents                        - create
//   PUT  /api/agents/:id                    - update
//   GET  /api/collections?courseId=         - list course collections
//   POST /api/collections                   - create a collection
//   GET  /api/collections/:id/sources       - list sources in a collection + statuses
//   POST /api/collections/:id/sources       - upload a source file (multipart)
//   POST /api/conversations                 - start a conversation for an agent
//   GET  /api/conversations/:id             - fetch transcript + state
//   POST /api/conversations/:id/messages    - send a student turn, stream the reply

import { AnthropicProvider, ProviderError } from "@marginalia/providers";
import type { LLMProvider, Message as LLMMessage } from "@marginalia/providers";
import {
  buildPrompt,
  clarityNoteFor,
  cleanReply,
  currentTopic,
  initialState,
  transition,
  type AgentDefinition,
  type BackboneState,
} from "@marginalia/backbone";
import { LIBRARY } from "@marginalia/voices";
import { parseCookies, SESSION_COOKIE } from "@marginalia/auth";
import type { Env } from "./env.js";
import { assertProdConfigured, authenticate, type Identity } from "./auth.js";
import { handleAuthRoute } from "./authRoutes.js";
import { scheduled } from "./scheduled.js";
import * as repo from "./repo.js";
import {
  bytesToText,
  fetchUrl,
  formatRetrievedContext,
  indexSource,
  parseMarkdown,
  parsePdf,
  retrieve,
  type Retrieved,
} from "./rag.js";
import type { CollectionSourceKind, VoiceRow } from "@marginalia/schema";
import { routeProvenance } from "./modules/provenance/routes.js";
import { routeAttendance } from "./modules/attendance/routes.js";

// v0.1 single-tenant default. Phase 2 derives org from the authenticated email.
const DEFAULT_ORG = "default";

/**
 * Whitelisted model ids. An agent's `definition.model` must be one of these —
 * instructors don't get to type free-form model strings into a JSON editor
 * and quietly upgrade themselves to the most expensive tier.
 */
const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
]);

/** Hard ceiling on a single student message. Cheap to enforce; bounds embed/LLM cost. */
const MAX_MESSAGE_CHARS = 8_000;

/**
 * Hard ceilings on conversation history sent to the LLM.
 *
 *   - MAX_HISTORY_TURNS: cap on message count (alternating user/assistant pairs).
 *   - MAX_HISTORY_CHARS: cap on total character budget; messages are dropped
 *     oldest-first when the trailing window exceeds this. Anthropic input
 *     tokens are billed every turn — prompt caching only protects the system
 *     block (see SystemPrompt), so the message tail bills full each time.
 *
 * 20 messages × 8000 char ceiling = 160KB worst case, but the char budget
 * normally kicks in well below that and keeps a verbose conversation from
 * paying full per-turn input cost.
 */
const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_CHARS = 32_000;

/** Stop attempting LLM title generation after this many failed/empty tries. */
const MAX_TITLE_ATTEMPTS = 2;

/** Hard ceiling on student turns per conversation when the agent has no backbone. */
const MAX_TURNS_PER_CONVERSATION = 80;

/** Hard ceiling on a single source upload (PDF, markdown, text, or URL fetch). */
const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Hard ceiling on chunks produced from one source. Bounds embedding cost per upload. */
const MAX_CHUNKS_PER_SOURCE = 400;

/** Minimum gap between users.last_seen_at writes for one user. Prevents
 *  write amplification under a chatty client (page loads, polling). */
const LAST_SEEN_WINDOW_MS = 5 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const error = (message: string, status: number) => json({ error: message }, status);

/**
 * Resolve the Origin to allow for this request, or null. We never reflect an
 * arbitrary Origin — only echo back values that exactly match an entry in
 * CORS_ALLOWED_ORIGINS. Browsers reject wildcard + credentials anyway, but
 * tightening the list keeps the surface honest.
 */
function allowedOriginFor(req: Request, env: Env): string | null {
  const origin = req.headers.get("origin");
  if (!origin || !env.CORS_ALLOWED_ORIGINS) return null;
  const allowed = env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return allowed.includes(origin) ? origin : null;
}

function applyCors(res: Response, origin: string | null): Response {
  if (!origin) return res;
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", origin);
  h.set("access-control-allow-credentials", "true");
  h.set("vary", "origin");
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Hard release blocker: refuse to serve in production unless app-level
    // auth is configured (AUTH_PROVIDER + SESSION_SIGNING_KEY).
    const misconfigured = assertProdConfigured(env);
    if (misconfigured) return misconfigured;

    const origin = allowedOriginFor(req, env);

    // Preflight. We're same-origin in production (worker serves both SPA
    // and /api/*), so this only fires from configured CORS origins.
    if (req.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 204 });
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
          "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": "content-type, x-provenance-llm-key",
          "access-control-max-age": "600",
          "vary": "origin",
        },
      });
    }

    const url = new URL(req.url);

    // v0.6: OIDC routes are public (the login/callback bootstrap the very
    // session that the authenticate() gate would check). They live outside
    // /api/* by convention so the asset router's SPA fallback doesn't
    // shadow them.
    if (url.pathname.startsWith("/auth/")) {
      const res = await handleAuthRoute(req, env, url);
      if (res) return applyCors(res, origin);
    }

    // v0.7 §2 — bootstrap the home-page agent list into index.html so the
    // first paint doesn't have to wait for /api/agents. Only the literal
    // path "/" hits this branch; every other SPA path is served by
    // env.ASSETS directly via the wrangler [assets] config. Failures fall
    // through to plain HTML — the SPA effect will re-fetch normally.
    if (req.method === "GET" && url.pathname === "/") {
      const html = await serveHomeWithBootstrap(req, env, ctx);
      if (html) return applyCors(html, origin);
    }

    if (!url.pathname.startsWith("/api/")) {
      return applyCors(error("Not found", 404), origin);
    }

    const identity = await authenticate(req, env);
    if (!identity) return applyCors(error("Unauthorized", 401), origin);

    // Bump users.last_seen_at for the roster UI (§10). Rate-limited inside
    // the helper to once per LAST_SEEN_WINDOW_MS so a chatty client doesn't
    // write-amplify D1. We don't block the request on this — waitUntil lets
    // it run after the response is sent. authenticate() already loaded the
    // user row via the session JOIN, so identity.userId is always populated
    // in production; the dev-bypass branch may have a null userId when the
    // configured email has no row yet, in which case there's nothing to bump.
    if (identity.userId) {
      ctx.waitUntil(
        repo.touchUserLastSeenById(env.DB, identity.userId, LAST_SEEN_WINDOW_MS)
          .catch(() => { /* best-effort */ }),
      );
    }

    try {
      const res = await route(req, env, ctx, url, identity);
      return applyCors(res, origin);
    } catch (err) {
      if (err instanceof ProviderError) {
        return applyCors(
          error(`LLM provider: ${err.message}`, err.retryable ? 502 : 400),
          origin,
        );
      }
      console.error("Unhandled error:", err);
      return applyCors(error("Internal error", 500), origin);
    }
  },
  scheduled,
} satisfies ExportedHandler<Env>;

async function route(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  identity: Identity,
): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const [, head, tail, sub] = parts;

  // GET /api/me — identity for the current request. The frontend uses
  // `userId` to gate self-affecting roster actions in the UI (the server
  // still enforces "can't lock yourself out" independently — see
  // patchRosterRoute/removeRosterRoute).
  //
  // v0.6: also exposes `isAdmin` so the SPA can show the /admin link.
  // `via` is kept for telemetry but in production it's always "session".
  if (req.method === "GET" && head === "me" && parts.length === 2) {
    // v1.0 §1/§2 — include the caller's enrollments (with course names + role)
    // so the SPA's CourseLayout can validate :courseId without a second
    // round-trip, and HomePage can render the multi-enrollment picker.
    // Empty array for unauthenticated / not-yet-registered users.
    const enrollments = identity.userId
      ? await repo.listEnrollmentsForUserEnriched(env.DB, identity.userId)
      : [];
    return json({
      email: identity.email,
      registered: identity.userId !== null,
      userId: identity.userId,
      displayName: identity.displayName,
      isAdmin: identity.isAdmin,
      via: identity.via,
      enrollments,
    });
  }

  // /api/provenance/* — writing tool that tracks word-level origin.
  // Self-contained module; see apps/worker/src/modules/provenance/README.md.
  if (head === "provenance") {
    const handled = await routeProvenance(req, env, url, identity, parts);
    if (handled) return handled;
  }

  // /api/attendance/* — QR check-in for in-person attendance.
  // Self-contained module; see apps/worker/src/modules/attendance/README.md.
  if (head === "attendance") {
    const handled = await routeAttendance(req, env, url, identity, parts);
    if (handled) return handled;
  }

  // /api/voices  (v0.7 §1: per-author library + sharing)
  if (head === "voices") {
    if (req.method === "GET" && parts.length === 2) {
      return listVoicesRoute(env, identity);
    }
    if (req.method === "POST" && parts.length === 2) {
      return createVoiceRoute(req, env, identity);
    }
    if (req.method === "POST" && parts.length === 3 && tail === "preview") {
      return previewVoiceRoute(req, env, identity);
    }
    if (tail) {
      if (req.method === "GET" && parts.length === 3) {
        return getVoiceRoute(env, identity, tail);
      }
      if (req.method === "PUT" && parts.length === 3) {
        return updateVoiceRoute(req, env, identity, tail);
      }
      if (req.method === "DELETE" && parts.length === 3) {
        return deleteVoiceRoute(env, identity, tail);
      }
      if (req.method === "POST" && parts.length === 4 && sub === "duplicate") {
        return duplicateVoiceRoute(env, identity, tail);
      }
      if (sub === "shares") {
        if (req.method === "GET" && parts.length === 4) {
          return listVoiceSharesRoute(env, identity, tail);
        }
        if (req.method === "POST" && parts.length === 4) {
          return createVoiceShareRoute(req, env, identity, tail);
        }
        if (req.method === "DELETE" && parts.length === 5 && parts[4]) {
          return deleteVoiceShareRoute(env, identity, tail, parts[4]);
        }
      }
    }
  }

  // /api/agents[/:id]  — top-level "what students pick", renamed from /assignments
  if (head === "agents") {
    // v1.0 §4 — list the caller's agents across every course they
    // instruct, for the "Duplicate from another course" picker. Tail
    // before the :id branch because /api/agents/duplicable is shaped
    // like /api/agents/:id otherwise.
    if (req.method === "GET" && parts.length === 3 && tail === "duplicable") {
      return listDuplicableAgentsRoute(env, identity);
    }
    if (req.method === "GET" && parts.length === 2) {
      return listAgentsRoute(req, env, url, identity);
    }
    if (req.method === "GET" && parts.length === 3) {
      return getAgentRoute(req, env, url, identity, tail!);
    }
    if (req.method === "POST" && parts.length === 2) {
      return createAgentRoute(req, env, identity);
    }
    // v1.0 §4 — POST /api/agents/:id/duplicate-to { targetCourseId }
    if (req.method === "POST" && parts.length === 4 && sub === "duplicate-to") {
      return duplicateAgentToRoute(req, env, identity, tail!);
    }
    if (req.method === "PUT" && parts.length === 3) {
      return updateAgentRoute(req, env, identity, tail!);
    }
    if (req.method === "DELETE" && parts.length === 3) {
      return deleteAgentRoute(req, env, identity, tail!);
    }
  }

  // /api/collections[/:id/sources[/url|/:sid/refresh]]
  if (head === "collections") {
    if (req.method === "GET" && parts.length === 2) {
      return listCollectionsRoute(req, env, url, identity);
    }
    if (req.method === "POST" && parts.length === 2) {
      return createCollectionRoute(req, env, identity);
    }
    if (tail && sub === "sources") {
      if (req.method === "GET" && parts.length === 4) {
        return listCollectionSourcesRoute(req, env, url, identity, tail);
      }
      if (req.method === "POST" && parts.length === 4) {
        return uploadCollectionSourceRoute(req, env, identity, tail);
      }
      // POST /api/collections/:id/sources/url            — fetch from URL
      // POST /api/collections/:id/sources/:sid/refresh   — re-fetch URL source
      if (req.method === "POST" && parts.length === 5 && parts[4] === "url") {
        return urlCollectionSourceRoute(req, env, identity, tail);
      }
      if (
        req.method === "POST" &&
        parts.length === 6 &&
        parts[5] === "refresh"
      ) {
        return refreshCollectionSourceRoute(req, env, identity, tail, parts[4]!);
      }
      // DELETE /api/collections/:id/sources/:sid — remove a source (v0.7 §3.4)
      if (req.method === "DELETE" && parts.length === 5 && parts[4]) {
        return deleteCollectionSourceRoute(req, env, identity, tail, parts[4]);
      }
    }
  }

  // v0.5 §3 — GET /api/sources/:sid/file?courseId=...
  // Auth-checked R2 stream for citation pill clicks. URL sources skip
  // R2 entirely; the client opens source_url directly. Doesn't live under
  // /api/collections because the citation row only carries source_id —
  // not the collection it belongs to — and that's fine: the source row
  // already knows its collection, and we scope on courseId for tenancy.
  if (head === "sources") {
    if (req.method === "GET" && parts.length === 4 && parts[3] === "file") {
      return getSourceFileRoute(req, env, url, identity, tail!);
    }
  }

  // /api/admin/* — instance-wide admin console (v0.6 §5)
  if (head === "admin") {
    return adminRoute(req, env, ctx, url, identity, parts);
  }

  // /api/courses/:courseId/join-codes[/:code]
  if (head === "courses" && sub === "join-codes") {
    const courseIdSeg = tail!;
    if (req.method === "GET" && parts.length === 4) {
      return listJoinCodesRoute(env, identity, courseIdSeg);
    }
    if (req.method === "POST" && parts.length === 4) {
      return createJoinCodeRoute(req, env, identity, courseIdSeg);
    }
    if (req.method === "DELETE" && parts.length === 5) {
      return revokeJoinCodeRoute(env, identity, courseIdSeg, parts[4]!);
    }
  }

  // /api/courses/:courseId/reveal-tab — instructor opts a lazy-reveal
  // feature (attendance / collections) into the dashboard tab strip
  // without having to use it first (v1.0 §6 / dashboard "Add a tool").
  if (
    head === "courses" &&
    sub === "reveal-tab" &&
    req.method === "POST" &&
    parts.length === 4
  ) {
    return revealTabRoute(req, env, identity, tail!);
  }

  // /api/join/:code — self-serve enrollment, signed-in users only
  if (head === "join" && req.method === "POST" && parts.length === 3) {
    return claimJoinCodeRoute(env, identity, tail!);
  }

  // /api/courses/:courseId/roster[/:userId]
  if (head === "courses" && sub === "roster") {
    const courseIdSeg = tail!;
    if (req.method === "GET" && parts.length === 4) {
      return listRosterRoute(env, identity, courseIdSeg);
    }
    if (req.method === "POST" && parts.length === 4) {
      return addRosterRoute(req, env, identity, courseIdSeg);
    }
    if (req.method === "PATCH" && parts.length === 5) {
      return patchRosterRoute(req, env, identity, courseIdSeg, parts[4]!);
    }
    if (req.method === "DELETE" && parts.length === 5) {
      return removeRosterRoute(env, identity, courseIdSeg, parts[4]!);
    }
  }

  // /api/conversations[/:id[/messages]]
  if (head === "conversations") {
    if (req.method === "GET" && parts.length === 2) {
      return listConversationsRoute(env, ctx, identity);
    }
    if (req.method === "POST" && parts.length === 2) {
      return startConversation(req, env, identity);
    }
    if (tail) {
      if (req.method === "GET" && parts.length === 3) {
        return getConversation(env, identity, tail);
      }
      if (req.method === "POST" && sub === "messages") {
        return postMessage(req, env, identity, tail);
      }
    }
  }

  return error("Not found", 404);
}

/**
 * Resolve the user row and confirm course enrollment.
 *
 * `userIdHint` is the caller's already-known users.id (from
 * `Identity.userId`, populated by `authenticate()`'s session JOIN). When
 * present, we skip the email lookup — saves one D1 read on the hot path of
 * every authenticated request. Falls back to email lookup when missing
 * (dev bypass for an email that doesn't have a users row yet).
 */
async function resolveUser(
  env: Env,
  email: string,
  courseId: string,
  userIdHint?: string | null,
) {
  let user: { id: string } | null;
  if (userIdHint) {
    user = { id: userIdHint };
  } else {
    user = await repo.findUserByEmail(env.DB, DEFAULT_ORG, email);
  }
  if (!user) return null;
  const enrollment = await repo.findEnrollment(env.DB, courseId, user.id);
  if (!enrollment) return null;
  return { user, enrollment };
}

/** Instructor gate. Used by every author endpoint. v0.6 collapsed the
 *  ta role into instructor — there is no longer a distinct author tier. */
function isAuthor(role: string): boolean {
  return role === "instructor";
}

// ─── voices ────────────────────────────────────────────────────────────────

/**
 * GET /api/voices — every voice available to the caller, split into
 * three buckets. Library is included so the agent picker has a single
 * source of truth.
 *
 * v0.7 §1: voices became per-author, not per-course. Authentication is
 * enough; no courseId required. Anyone signed in can author voices on
 * their account — the editor's agents are still gated on instructor
 * enrollment per-course at agent-save time.
 */
async function listVoicesRoute(env: Env, identity: Identity): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const [owned, shared] = await Promise.all([
    repo.listVoicesOwnedBy(env.DB, identity.userId),
    repo.listVoicesSharedWith(env.DB, identity.userId),
  ]);
  return json({
    library: LIBRARY.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
    })),
    owned: owned.map(toVoiceSummary),
    shared: shared.map((v) => ({
      ...toVoiceSummary(v),
      ownerUserId: v.owner_user_id,
    })),
  });
}

function toVoiceSummary(v: VoiceRow) {
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    updatedAt: v.updated_at,
  };
}

/** GET /api/voices/:id — full voice (including the prompt fragment).
 *  Permission: owner OR shared-with. Library voices are returned via
 *  a `?kind=library` shape so the editor can prefill a Customize flow. */
async function getVoiceRoute(
  env: Env,
  identity: Identity,
  voiceId: string,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  // Library passthrough — id starts with no "voice_" prefix.
  const libraryHit = LIBRARY.find((v) => v.id === voiceId);
  if (libraryHit) {
    return json({
      kind: "library",
      voice: {
        id: libraryHit.id,
        name: libraryHit.name,
        description: libraryHit.description,
        systemPromptFragment: libraryHit.systemPromptFragment,
      },
    });
  }
  const row = await repo.findVoiceUsableByUser(env.DB, voiceId, identity.userId);
  if (!row) return error("Voice not found", 404);
  const isOwner = row.owner_user_id === identity.userId;
  return json({
    kind: "custom",
    voice: {
      id: row.id,
      name: row.name,
      description: row.description,
      systemPromptFragment: row.system_prompt_fragment,
      ownerUserId: row.owner_user_id,
      isOwner,
      updatedAt: row.updated_at,
    },
  });
}

async function createVoiceRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string;
    systemPromptFragment?: string;
  } | null;
  const validation = validateVoiceBody(body);
  if (validation) return error(validation, 400);
  const row = await repo.createVoice(env.DB, {
    ownerUserId: identity.userId,
    name: body!.name!.trim(),
    description: body!.description!.trim(),
    systemPromptFragment: body!.systemPromptFragment!.trim(),
  });
  return json({ id: row.id }, 201);
}

async function updateVoiceRoute(
  req: Request,
  env: Env,
  identity: Identity,
  voiceId: string,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const existing = await repo.findVoiceById(env.DB, voiceId);
  if (!existing) return error("Voice not found", 404);
  if (existing.owner_user_id !== identity.userId) {
    return error("Only the owner can edit this voice", 403);
  }
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string;
    systemPromptFragment?: string;
  } | null;
  const validation = validateVoiceBody(body);
  if (validation) return error(validation, 400);
  await repo.updateVoice(env.DB, voiceId, {
    name: body!.name!.trim(),
    description: body!.description!.trim(),
    systemPromptFragment: body!.systemPromptFragment!.trim(),
  });
  return json({ ok: true });
}

/**
 * Delete a voice. Refuses if any live agent (owned by anyone) still
 * references it. The error lists the blocking agents so the owner can
 * coordinate the fix. Past conversation snapshots are unaffected
 * because they inline the VoiceDefinition (`kind: "custom"`).
 */
async function deleteVoiceRoute(
  env: Env,
  identity: Identity,
  voiceId: string,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const existing = await repo.findVoiceById(env.DB, voiceId);
  if (!existing) return error("Voice not found", 404);
  if (existing.owner_user_id !== identity.userId) {
    return error("Only the owner can delete this voice", 403);
  }
  const refs = await repo.listAgentsReferencingVoice(env.DB, voiceId);
  if (refs.length > 0) {
    return new Response(
      JSON.stringify({
        error:
          `Still referenced by ${refs.length} ` +
          `${refs.length === 1 ? "agent" : "agents"}. Edit those to use a ` +
          `different voice (or Duplicate this one into a new voice they own), ` +
          `then retry the delete.`,
        blockingAgents: refs,
      }),
      {
        status: 409,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
  await repo.deleteVoice(env.DB, voiceId);
  return new Response(null, { status: 204 });
}

/** POST /api/voices/:id/duplicate — deep-copy a voice the user owns OR
 *  has shared with them, into a new voice they own. The plan's Fork
 *  operation. */
async function duplicateVoiceRoute(
  env: Env,
  identity: Identity,
  voiceId: string,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  // Library voices are duplicable too — "Customize" prefills from the
  // library voice into a new owned custom.
  const lib = LIBRARY.find((v) => v.id === voiceId);
  let name: string, description: string, fragment: string;
  if (lib) {
    name = `${lib.name} (custom)`;
    description = lib.description;
    fragment = lib.systemPromptFragment;
  } else {
    const row = await repo.findVoiceUsableByUser(env.DB, voiceId, identity.userId);
    if (!row) return error("Voice not found", 404);
    name = `${row.name} (copy)`;
    description = row.description;
    fragment = row.system_prompt_fragment;
  }
  const created = await repo.createVoice(env.DB, {
    ownerUserId: identity.userId,
    name,
    description,
    systemPromptFragment: fragment,
  });
  return json({ id: created.id }, 201);
}

/** v0.7 §1.5 — the preview turn. Hard-coded prompt selection from a
 *  small fixed set so the per-save cost ceiling is predictable. */
const PREVIEW_PROMPTS: Record<string, string> = {
  derivative: "Explain what a derivative is.",
  photosynthesis: "Explain what photosynthesis is.",
  metaphor: "What is a metaphor, and what makes one work?",
};
async function previewVoiceRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  // Cost-amplification gate: voice preview is an Anthropic call billed
  // against the institution's key. Limit to users who are an instructor
  // on at least one course — without this, any signed-in student (or any
  // signed-in @domain account, regardless of enrollment) could script
  // arbitrary preview prompts and burn API credits.
  const isInstructorAnywhere = await repo.userIsInstructorAnywhere(
    env.DB,
    identity.userId,
  );
  if (!isInstructorAnywhere) {
    return error("Voice preview is an instructor-only action.", 403);
  }
  const body = (await req.json().catch(() => null)) as {
    systemPromptFragment?: string;
    name?: string;
    promptKey?: string;
  } | null;
  if (!body?.systemPromptFragment?.trim()) {
    return error("systemPromptFragment required", 400);
  }
  const promptKey = body.promptKey && PREVIEW_PROMPTS[body.promptKey]
    ? body.promptKey
    : "derivative";
  const question = PREVIEW_PROMPTS[promptKey]!;
  if (!env.ANTHROPIC_API_KEY) {
    return error("LLM provider not configured", 500);
  }
  const provider: LLMProvider = new AnthropicProvider({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.DEFAULT_MODEL,
  });
  try {
    const reply = await provider.chat(
      [{ role: "user", content: question }],
      {
        system: {
          instructions:
            `## Persona\n${body.systemPromptFragment}\n\n` +
            `(This is a preview turn. Answer concisely — one short paragraph.)`,
        },
        maxTokens: 400,
      },
    );
    return json({ promptKey, question, reply: reply.content });
  } catch (err) {
    if (err instanceof ProviderError) {
      return error(`Preview failed: ${err.message}`, err.retryable ? 502 : 400);
    }
    return error("Preview failed", 500);
  }
}

async function listVoiceSharesRoute(
  env: Env,
  identity: Identity,
  voiceId: string,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const existing = await repo.findVoiceById(env.DB, voiceId);
  if (!existing) return error("Voice not found", 404);
  if (existing.owner_user_id !== identity.userId) {
    return error("Only the owner can manage shares", 403);
  }
  const shares = await repo.listVoiceShares(env.DB, voiceId);
  return json({ shares });
}

async function createVoiceShareRoute(
  req: Request,
  env: Env,
  identity: Identity,
  voiceId: string,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const existing = await repo.findVoiceById(env.DB, voiceId);
  if (!existing) return error("Voice not found", 404);
  if (existing.owner_user_id !== identity.userId) {
    return error("Only the owner can manage shares", 403);
  }
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const target = body?.email?.trim().toLowerCase();
  if (!target) return error("email required", 400);
  const targetUser = await repo.findUserByEmail(env.DB, DEFAULT_ORG, target);
  if (!targetUser) {
    return error(
      "That user hasn't signed in yet. They must sign in once before you can share with them.",
      404,
    );
  }
  // Compare by user id rather than by email-string equality. An email-string
  // check could miss a self-share if the typed email differs in case beyond
  // toLowerCase (rare), if an admin previously renamed the email on a user
  // row, or if the user holds multiple aliases. The lookup-then-compare is
  // the source-of-truth check.
  if (targetUser.id === identity.userId) {
    return error("Can't share a voice with yourself.", 400);
  }
  await repo.createVoiceShare(env.DB, voiceId, targetUser.id);
  return json({ userId: targetUser.id, email: targetUser.email });
}

async function deleteVoiceShareRoute(
  env: Env,
  identity: Identity,
  voiceId: string,
  shareUserId: string,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const existing = await repo.findVoiceById(env.DB, voiceId);
  if (!existing) return error("Voice not found", 404);
  if (existing.owner_user_id !== identity.userId) {
    return error("Only the owner can manage shares", 403);
  }
  await repo.deleteVoiceShare(env.DB, voiceId, shareUserId);
  return new Response(null, { status: 204 });
}

function validateVoiceBody(body: {
  name?: string;
  description?: string;
  systemPromptFragment?: string;
} | null): string | null {
  if (!body) return "Body required";
  if (!body.name?.trim()) return "name required";
  if (!body.description?.trim()) return "description required";
  if (!body.systemPromptFragment?.trim()) return "systemPromptFragment required";
  if (body.name.length > 80) return "name too long (max 80)";
  if (body.description.length > 200) return "description too long (max 200)";
  if (body.systemPromptFragment.length > 8000) return "systemPromptFragment too long (max 8000)";
  return null;
}

// ─── agents (top-level: what students pick) ────────────────────────────────

/**
 * v0.7 §2 — fetch the SPA's index.html from env.ASSETS and splice in a
 * `<script>window.__BOOTSTRAP__ = ...</script>` tag containing the agent
 * list for the user's enrolled course. Saves one network round-trip +
 * one D1 connection round-trip on cold load.
 *
 * Returns null on any failure path so the caller can fall through to the
 * normal static-asset response. Failures here MUST NOT block the page —
 * the SPA's useEffect re-fetches anyway, so a missing bootstrap costs the
 * same as today's behaviour (no regression).
 *
 * Bootstrap is omitted when:
 *   • The user has no session (unauthenticated home shows the sign-in /
 *     join-code empty state — nothing useful to bootstrap).
 *   • The user has zero or multiple course enrollments (can't pick one).
 *   • The agent list query fails for any reason.
 *
 * Browser cache: we always set Cache-Control: private, no-store on the
 * HTML response. The bootstrap is per-user data; letting a CDN cache it
 * would leak between sessions.
 */
async function serveHomeWithBootstrap(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  try {
    // Fetch the static index.html in parallel with the bootstrap data.
    const indexUrl = new URL("/index.html", req.url);
    const indexReq = new Request(indexUrl.toString(), { method: "GET" });
    const [assetRes, bootstrap] = await Promise.all([
      env.ASSETS.fetch(indexReq),
      buildBootstrap(req, env, ctx),
    ]);
    if (!assetRes.ok) return null;
    const ct = assetRes.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    const html = await assetRes.text();
    const tag = bootstrap
      ? `<script>window.__BOOTSTRAP__=${JSON.stringify(bootstrap).replace(/</g, "\\u003c")};window.__BOOTSTRAP_AT__=${Date.now()};</script>`
      : "";
    // Splice the bootstrap tag right before </head>; if the SPA hasn't
    // got a </head> for some reason, prepend to <body> as a fallback.
    let body: string;
    if (html.includes("</head>")) {
      body = html.replace("</head>", `${tag}</head>`);
    } else if (html.includes("<body")) {
      body = html.replace(/<body([^>]*)>/, `<body$1>${tag}`);
    } else {
      body = tag + html;
    }
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    console.warn("Home bootstrap failed; falling through to plain HTML:", err);
    return null;
  }
}

/**
 * Build the bootstrap payload, or null when there's nothing useful to
 * inline. Conservative: must complete fast on cold paths, so it does at
 * most three D1 reads (authenticate → enrollments → agents).
 */
type BootstrapShape =
  | { kind: "agents"; courseId: string; agents: AgentSummaryShape[] }
  | {
      kind: "picker";
      enrollments: Array<{
        courseId: string;
        courseName: string;
        role: "student" | "instructor";
        joinedAt: number;
      }>;
    };

async function buildBootstrap(
  req: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<BootstrapShape | null> {
  // Short-circuit before authenticate() if there's no session cookie at all.
  // Saves one D1 session-table read for unauthenticated GET / (search
  // bots, link previews, monitoring, first-touch students). authenticate()
  // would no-op anyway, but the session lookup runs first.
  const cookies = parseCookies(req.headers.get("cookie"));
  if (!cookies[SESSION_COOKIE]) return null;

  const identity = await authenticate(req, env).catch(() => null);
  if (!identity || !identity.userId) return null;
  // v1.0 §2 — branch on enrollment count.
  //   * 0 → no bootstrap; the unauthenticated/no-enrollment empty state
  //         on HomePage already handles it.
  //   * 1 → inline the agent list, same as v0.7.
  //   * 2+ → inline the picker payload so the picker page (the SPA's
  //         CoursePickerPage / HomePage redirect target) paints with
  //         real data on first frame.
  const enrollments = await repo.listEnrollmentsForUserEnriched(
    env.DB,
    identity.userId,
  );
  if (enrollments.length === 0) return null;
  if (enrollments.length === 1) {
    const courseId = enrollments[0]!.courseId;
    const r = await loadAgentsForCourse(env, identity, courseId);
    if (r.status !== "ok") return null;
    return { kind: "agents", courseId, agents: r.agents };
  }
  return { kind: "picker", enrollments };
}

/**
 * v0.7 §2 — extracted so the home-page bootstrap path (which inlines the
 * agent list into the HTML response) can reuse the same logic as the
 * /api/agents endpoint. Returns the JSON-serialisable shape; callers wrap
 * with json() or splice into HTML as appropriate.
 *
 * Returns `{ status: "ok", agents }` or `{ status: "forbidden" | "missing" }`
 * so the bootstrap path can decide whether to omit the bootstrap block
 * entirely rather than embedding an error.
 */
async function loadAgentsForCourse(
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<
  | { status: "ok"; agents: AgentSummaryShape[] }
  | { status: "forbidden" }
> {
  // v0.7 §2 — fire all three D1 reads in parallel. The enrollment check
  // is the gate, but neither agent-list nor last-conversations depends on
  // it, and userId is known up-front from the session JOIN. If the
  // enrollment check fails we just discard the other two results.
  if (!identity.userId) return { status: "forbidden" };
  const [enrollment, rows, lastConvs] = await Promise.all([
    repo.findEnrollment(env.DB, courseId, identity.userId),
    repo.listAgents(env.DB, courseId),
    repo.listLastConversationsByAgent(env.DB, courseId, identity.userId),
  ]);
  if (!enrollment) return { status: "forbidden" };
  const lastByAgent = new Map(lastConvs.map((c) => [c.agentId, c]));
  return {
    status: "ok",
    agents: rows.map((r) => {
      const def = JSON.parse(r.definition) as AgentDefinition;
      const last = lastByAgent.get(r.id) ?? null;
      return {
        id: r.id,
        title: r.title,
        hasBackbone: !!def.backbone,
        hasCollection: !!def.collectionId,
        voice: def.voice,
        updatedAt: r.updated_at,
        lastConversationId: last?.conversationId ?? null,
        lastUpdatedAt: last?.updatedAt ?? null,
        lastCompletedAt: last?.completedAt ?? null,
      };
    }),
  };
}

interface AgentSummaryShape {
  id: string;
  title: string;
  hasBackbone: boolean;
  hasCollection: boolean;
  voice: AgentDefinition["voice"];
  updatedAt: number;
  lastConversationId: string | null;
  lastUpdatedAt: number | null;
  lastCompletedAt: number | null;
}

async function listAgentsRoute(
  _req: Request,
  env: Env,
  url: URL,
  identity: Identity,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const r = await loadAgentsForCourse(env, identity, courseId);
  if (r.status === "forbidden") return error("Not enrolled in this course", 403);
  return json({ agents: r.agents });
}

async function getAgentRoute(
  _req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  agentId: string,
): Promise<Response> {
  // v1.0 §7.1 — courseId is optional. When absent, infer it from the
  // agent row and require the caller to be enrolled in that course.
  // Lets the compose path (/new/:agentId) load the agent without
  // knowing its course up-front, instead of forcing the SPA to keep a
  // global course constant for callers who don't have one.
  const courseIdParam = url.searchParams.get("courseId");
  let row: Awaited<ReturnType<typeof repo.getAgent>>;
  if (courseIdParam) {
    row = await repo.getAgent(env.DB, courseIdParam, agentId);
  } else {
    row = await repo.findAgentById(env.DB, agentId);
  }
  if (!row) return error("Agent not found", 404);
  const courseId = row.course_id;
  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);

  return json({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    definition: JSON.parse(row.definition) as AgentDefinition,
    updatedAt: row.updated_at,
  });
}

async function createAgentRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    title?: string;
    definition?: AgentDefinition;
  } | null;
  if (!body?.courseId || !body.title || !body.definition) {
    return error("courseId, title, definition required", 400);
  }
  const resolved = await resolveUser(env, identity.email, body.courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (!isAuthor(resolved.enrollment.role)) {
    return error("Instructor only", 403);
  }
  const validation = await validateAgentDefinition(
    env,
    body.courseId,
    body.definition,
    resolved.user.id,
  );
  if (validation) return error(validation, 400);

  const row = await repo.createAgent(env.DB, {
    courseId: body.courseId,
    title: body.title,
    definition: JSON.stringify(body.definition),
  });
  return json({ id: row.id }, 201);
}

async function updateAgentRoute(
  req: Request,
  env: Env,
  identity: Identity,
  agentId: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    title?: string;
    definition?: AgentDefinition;
  } | null;
  if (!body?.courseId || !body.title || !body.definition) {
    return error("courseId, title, definition required", 400);
  }
  const resolved = await resolveUser(env, identity.email, body.courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (!isAuthor(resolved.enrollment.role)) {
    return error("Instructor only", 403);
  }
  const existing = await repo.getAgent(env.DB, body.courseId, agentId);
  if (!existing) return error("Agent not found", 404);
  const validation = await validateAgentDefinition(
    env,
    body.courseId,
    body.definition,
    resolved.user.id,
  );
  if (validation) return error(validation, 400);

  await repo.updateAgent(env.DB, body.courseId, agentId, {
    title: body.title,
    definition: JSON.stringify(body.definition),
  });
  return json({ ok: true });
}

/**
 * v0.5 §7 — delete an agent. Past conversations are preserved (the student's
 * record of their own work) but orphaned: agent_id is nulled and any
 * in-progress conversation is marked complete so the student sees a clean
 * "Completed on …" banner instead of a broken composer.
 *
 */
async function deleteAgentRoute(
  req: Request,
  env: Env,
  identity: Identity,
  agentId: string,
): Promise<Response> {
  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);

  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (resolved.enrollment.role !== "instructor") {
    return error("Instructor only", 403);
  }

  const existing = await repo.getAgent(env.DB, courseId, agentId);
  if (!existing) return error("Agent not found", 404);

  await repo.deleteAgentAndOrphanConversations(env.DB, courseId, agentId);
  return new Response(null, { status: 204 });
}

/**
 * v1.0 §4 — copy an existing agent into a target course. Both the source
 * course (where the agent lives today) and the target course must have
 * the caller enrolled as instructor. Voices come along untouched because
 * v0.7 made them per-author and cross-course-portable; `collectionId` is
 * dropped iff the source collection isn't accessible from the target
 * course (the common case — collections are strictly per-course).
 *
 * The copy is independent of the source: editing the new agent in the
 * target course doesn't touch the original. Matches the plan's
 * copy-on-use model (v1.0 §4 "Why copy and not shared reference").
 */
async function duplicateAgentToRoute(
  req: Request,
  env: Env,
  identity: Identity,
  sourceAgentId: string,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const body = (await req.json().catch(() => null)) as {
    targetCourseId?: string;
  } | null;
  if (!body?.targetCourseId) {
    return error("targetCourseId required", 400);
  }

  const source = await repo.findAgentById(env.DB, sourceAgentId);
  if (!source) return error("Agent not found", 404);

  // Authorize on both ends. Same-course duplication is allowed (it's how
  // an instructor forks an agent within a course) but in practice the UI
  // exposes the cross-course case.
  const sourceAuth = await resolveUser(
    env,
    identity.email,
    source.course_id,
    identity.userId,
  );
  if (!sourceAuth || !isAuthor(sourceAuth.enrollment.role)) {
    return error("Instructor on the source course required", 403);
  }
  const targetAuth = await resolveUser(
    env,
    identity.email,
    body.targetCourseId,
    identity.userId,
  );
  if (!targetAuth || !isAuthor(targetAuth.enrollment.role)) {
    return error("Instructor on the target course required", 403);
  }

  const def = JSON.parse(source.definition) as AgentDefinition;
  // If the source agent references a collection, keep the binding only
  // when a collection with that id exists in the target course. The plan
  // is explicit: scrub on inaccessible, otherwise leave alone. Today
  // collection ids are random per-course, so this almost always scrubs;
  // the branch is forward-compatible with any future shared-collections
  // story.
  let droppedCollection = false;
  if (def.collectionId) {
    const targetCollection = await repo.getCollection(
      env.DB,
      body.targetCourseId,
      def.collectionId,
    );
    if (!targetCollection) {
      delete def.collectionId;
      droppedCollection = true;
    }
  }

  const row = await repo.createAgent(env.DB, {
    courseId: body.targetCourseId,
    title: source.title,
    definition: JSON.stringify(def),
  });
  return json({ id: row.id, droppedCollection }, 201);
}

/**
 * v1.0 §4 — list every agent the caller can duplicate from. Walks the
 * caller's instructor enrollments and returns each course's agents,
 * grouped by source course. Excludes courses where the caller is only a
 * student. Used by the "+ From another course" modal in the agent
 * picker.
 */
async function listDuplicableAgentsRoute(
  env: Env,
  identity: Identity,
): Promise<Response> {
  if (!identity.userId) return error("Sign in required", 401);
  const enrollments = await repo.listEnrollmentsForUserEnriched(
    env.DB,
    identity.userId,
  );
  const instructorEnrollments = enrollments.filter(
    (e) => e.role === "instructor",
  );
  // Fan out per course; D1 reads are cheap and the instructor's course
  // count is small (1–5 per the plan).
  const groups = await Promise.all(
    instructorEnrollments.map(async (e) => {
      const rows = await repo.listAgents(env.DB, e.courseId);
      return {
        courseId: e.courseId,
        courseName: e.courseName,
        agents: rows.map((r) => {
          const def = JSON.parse(r.definition) as AgentDefinition;
          return {
            id: r.id,
            title: r.title,
            hasBackbone: !!def.backbone,
            hasCollection: !!def.collectionId,
            updatedAt: r.updated_at,
          };
        }),
      };
    }),
  );
  return json({ courses: groups });
}

/**
 * Shape-check + cross-reference checks before persisting. Returns an error
 * string or null. Async because it verifies the collection exists within the
 * same course (cross-course collection references would silently leak content
 * between tenants, violating the "filter by course_id, no exceptions"
 * invariant).
 */
async function validateAgentDefinition(
  env: Env,
  courseId: string,
  def: AgentDefinition,
  callerUserId: string | null,
): Promise<string | null> {
  if (def.version !== 2) return "definition.version must be 2";
  if (!def.voice ||
      (def.voice.kind !== "library" &&
       def.voice.kind !== "custom" &&
       def.voice.kind !== "custom-ref")) {
    return "definition.voice must be a library, custom-ref, or custom ref";
  }
  if (def.voice.kind === "library") {
    const ref = def.voice;
    if (!LIBRARY.some((v) => v.id === ref.id)) {
      return `Unknown library voice: ${ref.id}`;
    }
  } else if (def.voice.kind === "custom-ref") {
    // v0.7 §1 — agents save by reference, not inline. The voice must
    // exist AND be usable by the saving instructor (owned or shared).
    if (!callerUserId) return "Sign in required to save a custom voice agent";
    const usable = await repo.findVoiceUsableByUser(
      env.DB,
      def.voice.voiceId,
      callerUserId,
    );
    if (!usable) {
      return "Voice not found, or not shared with you";
    }
  } else if (def.voice.kind === "custom") {
    // Pre-v0.7 inline form. Still accepted so older agents keep saving
    // round-trip-clean; new editor saves use custom-ref. The inline `id`
    // is cosmetic — it's not used to resolve anything at turn time
    // (the inline definition wins via resolveVoice's switch on kind), so
    // collisions with library voice ids or real voices.id values are
    // harmless. resolveVoice does not look up custom-inline by id.
    const inline = def.voice.definition;
    if (
      !inline ||
      typeof inline.id !== "string" || !inline.id.trim() ||
      typeof inline.name !== "string" || !inline.name.trim() ||
      typeof inline.description !== "string" ||
      typeof inline.systemPromptFragment !== "string" ||
      !inline.systemPromptFragment.trim()
    ) {
      return "Custom voice must include id, name, description, systemPromptFragment";
    }
  }
  if (def.model !== undefined && !ALLOWED_MODELS.has(def.model)) {
    return `Model ${def.model} is not in the allowed list`;
  }
  if (def.backbone) {
    const bb = def.backbone;
    if (!Array.isArray(bb.topics) || bb.topics.length === 0) {
      return "backbone.topics must be a non-empty array";
    }
    if (
      typeof bb.defaultTurnBudget !== "number" ||
      !Number.isInteger(bb.defaultTurnBudget) ||
      bb.defaultTurnBudget < 1
    ) {
      return "backbone.defaultTurnBudget must be a positive integer";
    }
    if (!bb.exitCondition?.trim()) {
      return "backbone.exitCondition is required";
    }
    const seenIds = new Set<string>();
    for (const t of bb.topics) {
      if (!t.id?.trim() || !t.title?.trim()) {
        return "every backbone topic needs id and title";
      }
      if (seenIds.has(t.id)) {
        return `Duplicate backbone topic id: ${t.id}`;
      }
      seenIds.add(t.id);
      if (
        t.turnBudget !== undefined &&
        (!Number.isInteger(t.turnBudget) || t.turnBudget < 1)
      ) {
        return `Topic ${t.id} turnBudget must be a positive integer`;
      }
    }
  }
  if (def.collectionId) {
    const collection = await repo.getCollection(env.DB, courseId, def.collectionId);
    if (!collection) {
      return `Collection ${def.collectionId} not found in this course`;
    }
  }
  return null;
}

// ─── collections ───────────────────────────────────────────────────────────

async function listCollectionsRoute(
  _req: Request,
  env: Env,
  url: URL,
  identity: Identity,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  // Parallelize the enrollment check with the list fetch — we discard the
  // list if forbidden, but the saved round-trip is the v0.7 §2 pattern.
  if (!identity.userId) return error("Sign in required", 401);
  const [enrollment, rows] = await Promise.all([
    repo.findEnrollment(env.DB, courseId, identity.userId),
    repo.listCollectionsWithCounts(env.DB, courseId),
  ]);
  if (!enrollment) return error("Not enrolled in this course", 403);
  return json({
    collections: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      updatedAt: r.updated_at,
      sourceCount: Number(r.source_count ?? 0),
    })),
  });
}

/**
 * v1.0 §6 — opt a lazy-reveal feature into the dashboard tab strip
 * without using it first. Same effect as the implicit flip that happens
 * on first use, but instructor-driven from the dashboard's "Add a tool"
 * affordance. Instructor-only; idempotent.
 */
async function revealTabRoute(
  req: Request,
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<Response> {
  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (!isAuthor(resolved.enrollment.role)) {
    return error("Instructor only", 403);
  }
  const body = (await req.json().catch(() => null)) as {
    feature?: "attendance" | "collections";
  } | null;
  if (body?.feature !== "attendance" && body?.feature !== "collections") {
    return error("feature must be 'attendance' or 'collections'", 400);
  }
  await repo.markCourseFeatureShown(env.DB, courseId, body.feature);
  return json({ ok: true });
}

async function createCollectionRoute(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    name?: string;
    description?: string;
  } | null;
  if (!body?.courseId || !body.name) {
    return error("courseId and name are required", 400);
  }
  const resolved = await resolveUser(env, identity.email, body.courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (!isAuthor(resolved.enrollment.role)) {
    return error("Instructor only", 403);
  }
  const row = await repo.createCollection(env.DB, {
    courseId: body.courseId,
    name: body.name,
    description: body.description?.trim() ? body.description.trim() : null,
  });
  // v1.0 §6 — first collection in this course makes the Collections tab
  // appear on the dashboard. Idempotent on subsequent creates.
  await repo.markCourseFeatureShown(env.DB, body.courseId, "collections");
  return json(
    {
      id: row.id,
      name: row.name,
      description: row.description,
      updatedAt: row.updated_at,
    },
    201,
  );
}

async function listCollectionSourcesRoute(
  _req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  collectionId: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);

  const collection = await repo.getCollection(env.DB, courseId, collectionId);
  if (!collection) return error("Collection not found", 404);

  const sources = await repo.listCollectionSources(env.DB, courseId, collectionId);
  return json({
    collection: {
      id: collection.id,
      name: collection.name,
      description: collection.description,
    },
    sources: sources.map((s) => ({
      id: s.id,
      filename: s.filename,
      byteSize: s.byte_size,
      kind: s.kind,
      sourceUrl: s.source_url,
      fetchedAt: s.fetched_at,
      contentType: s.content_type,
      chunks: s.chunks,
      status: s.status,
      error: s.error,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    })),
  });
}

async function uploadCollectionSourceRoute(
  req: Request,
  env: Env,
  identity: Identity,
  collectionId: string,
): Promise<Response> {
  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (!isAuthor(resolved.enrollment.role)) {
    return error("Instructor only", 403);
  }
  const collection = await repo.getCollection(env.DB, courseId, collectionId);
  if (!collection) return error("Collection not found", 404);

  const form = await req.formData().catch(() => null);
  // Workers' FormData.get is typed as `string | null` but actually returns
  // a File for binary parts; cast through unknown for the type system.
  const file = form?.get("file") as unknown as File | string | null;
  if (!file || typeof file === "string") {
    return error("Multipart form field `file` is required", 400);
  }

  // Dispatch by extension. The set is small enough that a lookup beats a
  // generic content-type sniff: instructors upload from a file picker, and
  // the extension is reliable in that path. URLs go through their own route.
  const lower = file.name.toLowerCase();
  let kind: CollectionSourceKind;
  if (lower.endsWith(".pdf")) kind = "pdf";
  else if (lower.endsWith(".md") || lower.endsWith(".markdown")) kind = "markdown";
  else if (lower.endsWith(".txt")) kind = "text";
  else {
    return error(
      "Unsupported file type. Upload .pdf, .md, or .txt — or paste / link from the other tabs.",
      400,
    );
  }

  if (file.size > MAX_SOURCE_BYTES) {
    return error(
      `File exceeds ${MAX_SOURCE_BYTES} bytes; split it into smaller files.`,
      413,
    );
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    return error(`File exceeds ${MAX_SOURCE_BYTES} bytes after read.`, 413);
  }

  if (kind === "pdf") {
    // Magic-byte check: real PDFs start with "%PDF-". Cheap insurance against
    // a renamed-binary upload triggering the parser on garbage.
    const head = new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength));
    const isPdf =
      head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 &&
      head[3] === 0x46 && head[4] === 0x2d;
    if (!isPdf) {
      return error("File does not look like a PDF (missing %PDF- header).", 400);
    }
  }

  return persistAndIndex(env, {
    collectionId,
    courseId,
    bytes,
    filename: file.name,
    kind,
    contentType: file.type || defaultContentType(kind),
  });
}

function defaultContentType(kind: CollectionSourceKind): string {
  switch (kind) {
    case "pdf": return "application/pdf";
    case "markdown": return "text/markdown";
    case "text": return "text/plain";
    case "url": return "text/html";
  }
}

/**
 * Shared "write to R2 → insert row → parse → index → update status" pipeline.
 * Every source kind funnels through here once the bytes + intended kind are
 * known. Keeps the per-route handlers thin.
 */
async function persistAndIndex(
  env: Env,
  params: {
    collectionId: string;
    courseId: string;
    bytes: ArrayBuffer;
    filename: string;
    kind: CollectionSourceKind;
    contentType: string;
    sourceUrl?: string;
  },
): Promise<Response> {
  const safeName = sanitizeFilename(params.filename);
  const r2Key = `${params.courseId}/${params.collectionId}/${crypto.randomUUID()}-${safeName}`;
  await env.SOURCES.put(r2Key, params.bytes, {
    httpMetadata: { contentType: params.contentType },
  });

  const source = await repo.createCollectionSource(env.DB, {
    collectionId: params.collectionId,
    courseId: params.courseId,
    filename: safeName,
    r2Key,
    byteSize: params.bytes.byteLength,
    kind: params.kind,
    sourceUrl: params.sourceUrl ?? null,
    fetchedAt: params.kind === "url" ? Date.now() : null,
    contentType: params.contentType,
  });

  try {
    const text = await extractText(params.bytes, params.kind, params.contentType, params.sourceUrl);
    if (!text.trim()) {
      throw new Error(
        params.kind === "pdf"
          ? "PDF parsed to empty text — scanned/image-only PDFs aren't supported yet."
          : "Source parsed to empty text — nothing to index.",
      );
    }
    const { chunks } = await indexSource(env, {
      collectionId: params.collectionId,
      sourceId: source.id,
      text,
      maxChunks: MAX_CHUNKS_PER_SOURCE,
    });
    await repo.updateCollectionSourceStatus(env.DB, params.courseId, source.id, {
      status: "indexed",
      chunks,
    });
    return json({ id: source.id, chunks, status: "indexed" }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed";
    await repo.updateCollectionSourceStatus(env.DB, params.courseId, source.id, {
      status: "failed",
      error: message,
    });
    return json({ id: source.id, status: "failed", error: message }, 201);
  }
}

/** Bytes → plain text, dispatched by source kind. */
async function extractText(
  bytes: ArrayBuffer,
  kind: CollectionSourceKind,
  contentType: string,
  url?: string,
): Promise<string> {
  if (kind === "pdf") return parsePdf(bytes);
  if (kind === "markdown" && !contentType.includes("html")) {
    return parseMarkdown(new TextDecoder("utf-8").decode(bytes));
  }
  // url-kind rows store snapshot bytes whose true type is HTML / markdown /
  // text; bytesToText sniffs and routes accordingly. Plain markdown/text
  // uploads end up here when their content-type already says "html" (rare;
  // covers the fallthrough case cleanly).
  return bytesToText(bytes, kind === "text" ? "text" : "markdown", contentType, url);
}

/**
 * POST /api/collections/:id/sources/url — instructor pastes a URL.
 * Worker fetches it, snapshots bytes to R2, indexes, and returns the row.
 */
async function urlCollectionSourceRoute(
  req: Request,
  env: Env,
  identity: Identity,
  collectionId: string,
): Promise<Response> {
  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (!isAuthor(resolved.enrollment.role)) {
    return error("Instructor only", 403);
  }
  const collection = await repo.getCollection(env.DB, courseId, collectionId);
  if (!collection) return error("Collection not found", 404);

  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const target = body?.url?.trim();
  if (!target) return error("Field `url` is required", 400);
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return error("Field `url` is not a valid URL", 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return error("Only http(s) URLs are allowed", 400);
  }

  let fetched;
  try {
    fetched = await fetchUrl(target, MAX_SOURCE_BYTES);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Fetch failed", 400);
  }

  // Derive a stable, human-readable filename from the URL — the original last
  // path segment if there is one, otherwise the hostname. The extension is
  // chosen from the sniffed content-type so refresh produces the same name.
  const ext = fetched.contentType.includes("html") ? ".html"
    : fetched.contentType.includes("markdown") ? ".md"
    : ".txt";
  const last = parsed.pathname.split("/").filter(Boolean).pop();
  const baseName = (last || parsed.hostname).replace(/\.[a-z0-9]+$/i, "");
  return persistAndIndex(env, {
    collectionId,
    courseId,
    bytes: fetched.bytes,
    filename: baseName + ext,
    kind: "url",
    contentType: fetched.contentType || defaultContentType("url"),
    sourceUrl: fetched.finalUrl,
  });
}

/**
 * POST /api/collections/:id/sources/:sid/refresh — re-fetch a URL source.
 * Deletes the old R2 snapshot, drops the old vectors, fetches fresh bytes,
 * snapshots, and re-indexes. The conversation-time retrieval seamlessly sees
 * the new chunks because the namespace + source_id are unchanged.
 */
async function refreshCollectionSourceRoute(
  req: Request,
  env: Env,
  identity: Identity,
  collectionId: string,
  sourceId: string,
): Promise<Response> {
  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (!isAuthor(resolved.enrollment.role)) {
    return error("Instructor only", 403);
  }
  const row = await repo.getCollectionSource(env.DB, courseId, sourceId);
  if (!row || row.collection_id !== collectionId) {
    return error("Source not found", 404);
  }
  if (row.kind !== "url" || !row.source_url) {
    return error("Only URL sources can be refreshed", 400);
  }

  let fetched;
  try {
    fetched = await fetchUrl(row.source_url, MAX_SOURCE_BYTES);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    await repo.updateCollectionSourceStatus(env.DB, courseId, sourceId, {
      status: "failed",
      error: message,
    });
    return error(message, 400);
  }

  // Snapshot under a new R2 key so the upload + delete don't race the same
  // object; once the new snapshot lands and indexing succeeds, drop the old
  // blob. If anything between here and "indexed" throws, the old R2 blob is
  // left in place — a small storage cost in exchange for never serving from
  // a half-written replacement.
  const newR2Key = `${courseId}/${collectionId}/${crypto.randomUUID()}-${sanitizeFilename(row.filename)}`;
  await env.SOURCES.put(newR2Key, fetched.bytes, {
    httpMetadata: { contentType: fetched.contentType || defaultContentType("url") },
  });

  // Drop old vectors before re-indexing so stale chunks can't out-rank the
  // refreshed ones during the brief window when both could exist.
  try {
    await dropSourceVectors(env, collectionId, sourceId, row.chunks);
  } catch (err) {
    console.warn("Failed to drop old vectors before refresh:", err);
  }

  await repo.refreshCollectionSourceRow(env.DB, courseId, sourceId, {
    r2Key: newR2Key,
    byteSize: fetched.bytes.byteLength,
    contentType: fetched.contentType,
    fetchedAt: Date.now(),
  });

  try {
    const text = await extractText(fetched.bytes, "url", fetched.contentType, fetched.finalUrl);
    if (!text.trim()) throw new Error("Refreshed URL parsed to empty text.");
    const { chunks } = await indexSource(env, {
      collectionId,
      sourceId,
      text,
      maxChunks: MAX_CHUNKS_PER_SOURCE,
    });
    await repo.updateCollectionSourceStatus(env.DB, courseId, sourceId, {
      status: "indexed",
      chunks,
    });
    // Old blob now safe to delete.
    await env.SOURCES.delete(row.r2_key).catch(() => {});
    return json({ id: sourceId, chunks, status: "indexed", fetchedAt: Date.now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Re-indexing failed";
    await repo.updateCollectionSourceStatus(env.DB, courseId, sourceId, {
      status: "failed",
      error: message,
    });
    return error(message, 500);
  }
}

/**
 * v0.7 §3.4 — DELETE /api/collections/:id/sources/:sid. Instructor-only.
 * Drops the D1 row, the R2 blob (if any), and the Vectorize chunks.
 * message_sources rows that pointed at this source survive with source_id
 * NULL — past conversation citations continue to render via their
 * snapshot columns (filename + page text were copied in at commit time).
 */
async function deleteCollectionSourceRoute(
  req: Request,
  env: Env,
  identity: Identity,
  collectionId: string,
  sourceId: string,
): Promise<Response> {
  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (!isAuthor(resolved.enrollment.role)) {
    return error("Instructor only", 403);
  }
  const row = await repo.getCollectionSource(env.DB, courseId, sourceId);
  if (!row || row.collection_id !== collectionId) {
    return error("Source not found", 404);
  }

  // Drop vectors first — if this fails we leave the D1 row in place so a
  // retry is straightforward. (Same conservative ordering as the cascade.)
  try {
    await dropSourceVectors(env, collectionId, sourceId, row.chunks);
  } catch (err) {
    console.warn("Failed to drop source vectors during delete:", err);
  }

  // R2 blob — URL sources may not have one if the fetch failed; ignore
  // missing-key errors.
  if (row.r2_key) {
    await env.SOURCES.delete(row.r2_key).catch(() => {});
  }

  await repo.deleteCollectionSource(env.DB, courseId, sourceId);
  return new Response(null, { status: 204 });
}

/**
 * v0.5 §3 — stream an R2-backed source file back through the worker,
 * gated on the requester's enrollment in the source's course. URL sources
 * don't have R2 bytes; the client opens source_url directly.
 *
 * No signed URL — Workers R2 doesn't presign by default, and we want the
 * worker to enforce auth anyway. A 200 with the file body keeps the
 * citation-pill click path trivially `target="_blank"` on the client side.
 */
async function getSourceFileRoute(
  _req: Request,
  env: Env,
  url: URL,
  identity: Identity,
  sourceId: string,
): Promise<Response> {
  const courseId = url.searchParams.get("courseId");
  if (!courseId) return error("courseId is required", 400);
  // Parallelize the enrollment check with the row read.
  if (!identity.userId) return error("Sign in required", 401);
  const [enrollment, row] = await Promise.all([
    repo.findEnrollment(env.DB, courseId, identity.userId),
    repo.getCollectionSource(env.DB, courseId, sourceId),
  ]);
  if (!enrollment) return error("Not enrolled in this course", 403);
  if (!row) return error("Source not found", 404);
  if (row.kind === "url") {
    // URL sources have no R2 body; the client should open source_url itself.
    return error("URL sources have no file body; open sourceUrl directly", 400);
  }

  const obj = await env.SOURCES.get(row.r2_key);
  if (!obj) return error("File missing from R2", 404);

  const headers = new Headers();
  headers.set(
    "content-type",
    row.content_type ?? obj.httpMetadata?.contentType ?? "application/octet-stream",
  );
  // Inline so PDFs/markdown render in the browser; the filename is the
  // download name if the user does choose to save.
  headers.set(
    "content-disposition",
    `inline; filename="${row.filename.replace(/"/g, "")}"`,
  );
  // Refuse browser/middleware MIME-sniffing. Sources are instructor-uploaded
  // PDFs/markdown/text only (validated at upload); nosniff blocks a misnamed
  // upload from being interpreted as HTML/JS by a permissive client. The
  // R2-served path is same-origin with the SPA, so any HTML execution here
  // would inherit the session cookie.
  headers.set("x-content-type-options", "nosniff");
  return new Response(obj.body, { headers });
}

/**
 * Vectorize doesn't expose a "delete by metadata filter" so we reconstruct
 * the deterministic per-chunk ids ({source_id}:{chunk_idx}, 0..N-1) and
 * delete by id.
 *
 * Edge case: if a previous index run partially upserted vectors and then
 * threw, `collection_sources.chunks` could be 0 (failed) or a value lower
 * than the actual number of orphans in Vectorize. We therefore also attempt
 * to delete up to MAX_CHUNKS_PER_SOURCE ids as a best-effort sweep —
 * deleteByIds on missing ids is a no-op, so the cost is one extra Vectorize
 * call per refresh, paid in exchange for never serving stale orphans.
 */
async function dropSourceVectors(
  env: Env,
  _collectionId: string,
  sourceId: string,
  oldChunks: number,
): Promise<void> {
  const upper = Math.max(oldChunks, MAX_CHUNKS_PER_SOURCE);
  if (!upper) return;
  const ids = Array.from({ length: upper }, (_, i) => `${sourceId}:${i}`);
  // Vectorize accepts up to ~1000 ids per call; MAX_CHUNKS_PER_SOURCE (400)
  // sits well under that ceiling.
  await env.VECTORIZE.deleteByIds(ids);
}

/**
 * Make a filename safe to embed in an R2 key. Strips path separators and
 * control bytes, collapses anything outside a conservative ASCII set, and
 * caps length. R2 treats keys as opaque strings but odd keys make debugging
 * and bucket listings unpleasant.
 */
function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, "");
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  const trimmed = cleaned.length === 0 ? "upload.pdf" : cleaned;
  return trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed;
}

// ─── roster (instructor-only course membership management) ────────────────

/** Resolve + require the caller is `instructor` on this course. */
async function requireInstructor(
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<{ user: { id: string }; enrollment: { role: string } } | Response> {
  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);
  if (resolved.enrollment.role !== "instructor") {
    return error("Instructor only", 403);
  }
  return resolved;
}

async function listRosterRoute(
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<Response> {
  // Parallelize the instructor gate with the roster fetch — same v0.7 §2
  // pattern as the agent list, but with a role check on top of enrollment.
  if (!identity.userId) return error("Sign in required", 401);
  const [enrollment, roster] = await Promise.all([
    repo.findEnrollment(env.DB, courseId, identity.userId),
    repo.listRosterForCourse(env.DB, courseId),
  ]);
  if (!enrollment) return error("Not enrolled in this course", 403);
  if (enrollment.role !== "instructor") return error("Instructor only", 403);
  return json({ roster });
}

async function addRosterRoute(
  req: Request,
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<Response> {
  const gate = await requireInstructor(env, identity, courseId);
  if (gate instanceof Response) return gate;
  // v0.6 dropped the `ta` role (migration 0004). Existing `ta` rows were
  // migrated to `instructor`; new requests carrying `role:"ta"` 400 here.
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    role?: "student" | "instructor";
  } | null;
  const newEmail = body?.email?.trim().toLowerCase();
  const role = body?.role;
  if (!newEmail || !role) return error("email and role are required", 400);
  if (role !== "student" && role !== "instructor") {
    return error("role must be student or instructor", 400);
  }
  // Cheap sanity check — anything past this is the auth layer's job.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return error("email is not well-formed", 400);
  }

  let target = await repo.findUserByEmail(env.DB, DEFAULT_ORG, newEmail);
  if (!target) {
    target = await repo.createUser(env.DB, {
      orgId: DEFAULT_ORG,
      email: newEmail,
    });
  }
  const existing = await repo.findEnrollment(env.DB, courseId, target.id);
  if (existing) {
    if (existing.role !== role) {
      await repo.updateEnrollmentRole(env.DB, courseId, target.id, role);
    }
  } else {
    await repo.createEnrollment(env.DB, {
      courseId,
      userId: target.id,
      role,
    });
  }
  return json({
    userId: target.id,
    email: target.email,
    role,
  }, 201);
}

async function patchRosterRoute(
  req: Request,
  env: Env,
  identity: Identity,
  courseId: string,
  userId: string,
): Promise<Response> {
  const gate = await requireInstructor(env, identity, courseId);
  if (gate instanceof Response) return gate;
  const body = (await req.json().catch(() => null)) as {
    role?: "student" | "instructor";
  } | null;
  if (!body?.role || (body.role !== "student" && body.role !== "instructor")) {
    return error("role must be student or instructor", 400);
  }
  // Don't lock yourself out: a sole instructor can't demote themselves.
  if (gate.user.id === userId && body.role !== "instructor") {
    const roster = await repo.listRosterForCourse(env.DB, courseId);
    const otherInstructors = roster.filter(
      (r) => r.role === "instructor" && r.userId !== userId,
    );
    if (otherInstructors.length === 0) {
      return error(
        "Can't demote the only instructor on this course.",
        409,
      );
    }
  }
  const existing = await repo.findEnrollment(env.DB, courseId, userId);
  if (!existing) return error("Enrollment not found", 404);
  await repo.updateEnrollmentRole(env.DB, courseId, userId, body.role);
  return json({ userId, role: body.role });
}

async function removeRosterRoute(
  env: Env,
  identity: Identity,
  courseId: string,
  userId: string,
): Promise<Response> {
  const gate = await requireInstructor(env, identity, courseId);
  if (gate instanceof Response) return gate;
  // Don't lock yourself out: refuse removing your own instructor enrollment
  // (v0.4 §10 explicit rule).
  if (gate.user.id === userId) {
    return error(
      "Can't remove your own enrollment. Ask another instructor to do it.",
      409,
    );
  }
  const existing = await repo.findEnrollment(env.DB, courseId, userId);
  if (!existing) return error("Enrollment not found", 404);
  await repo.deleteEnrollment(env.DB, courseId, userId);
  return json({ userId, removed: true });
}

// ─── join codes (v0.6 §4) ──────────────────────────────────────────────────

/**
 * v0.7 §3.12 — set of email domains that may claim join codes for this
 * instance. Drawn from ALLOWED_EMAIL_DOMAINS plus, implicitly, the
 * domains of every INSTANCE_ADMIN_EMAILS entry (admins are trusted by
 * construction).
 *
 * When the returned set is empty, the worker does not enforce a domain
 * gate — appropriate for local dev / unconfigured test instances.
 * Production instances should set ALLOWED_EMAIL_DOMAINS.
 */
function allowedEmailDomains(env: Env): Set<string> {
  const out = new Set<string>();
  for (const raw of (env.ALLOWED_EMAIL_DOMAINS ?? "").split(",")) {
    const d = raw.trim().toLowerCase().replace(/^@/, "");
    if (d) out.add(d);
  }
  for (const raw of (env.INSTANCE_ADMIN_EMAILS ?? "").split(",")) {
    const at = raw.trim().indexOf("@");
    if (at >= 0) {
      const d = raw.trim().slice(at + 1).toLowerCase();
      if (d) out.add(d);
    }
  }
  return out;
}

function emailDomainOf(email: string): string {
  const at = email.indexOf("@");
  return at < 0 ? "" : email.slice(at + 1).toLowerCase();
}

/**
 * Generate a short, human-typable code. Format:
 *   <3-5 alphanumeric chars derived from course name>-<6 alphanumeric random>
 *
 * The course-derived prefix gives instructors a chance to recognise the code
 * verbally; the random suffix supplies the entropy. Suffix charset excludes
 * easily-confused glyphs (0/O, 1/I/l) so a student dictating over Zoom is
 * less likely to mistype.
 */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateJoinCode(courseName: string): string {
  const prefix = courseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 5) || "course";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const b of bytes) suffix += CODE_CHARS[b % CODE_CHARS.length];
  return `${prefix}-${suffix}`;
}

async function listJoinCodesRoute(
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<Response> {
  const gate = await requireInstructor(env, identity, courseId);
  if (gate instanceof Response) return gate;
  const rows = await repo.listJoinCodes(env.DB, courseId);
  return json({
    codes: rows.map((r) => ({
      code: r.code,
      emailDomain: r.email_domain,
      expiresAt: r.expires_at,
      maxUses: r.max_uses,
      uses: r.uses,
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
    })),
  });
}

async function createJoinCodeRoute(
  req: Request,
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<Response> {
  const gate = await requireInstructor(env, identity, courseId);
  if (gate instanceof Response) return gate;
  const body = (await req.json().catch(() => null)) as {
    expiresAt?: number | null;
    maxUses?: number | null;
  } | null;

  const course = await repo.findCourseById(env.DB, courseId);
  if (!course) return error("Course not found", 404);

  // v0.7 §3.12 — per-code email_domain is gone; the gate is now the
  // instance-wide ALLOWED_EMAIL_DOMAINS env list, enforced at claim
  // time. The column survives one release as a safety net and is always
  // written NULL by new code.
  const emailDomain: string | null = null;

  const expiresAt =
    typeof body?.expiresAt === "number" && body.expiresAt > Date.now()
      ? body.expiresAt
      : null;
  const maxUses =
    typeof body?.maxUses === "number" && Number.isInteger(body.maxUses) && body.maxUses > 0
      ? body.maxUses
      : null;

  // Up to a few attempts to avoid a PK collision on the very rare random
  // suffix duplicate. If we can't find a free code after this many tries,
  // something is wildly wrong (or someone is generating thousands of codes
  // in a hot loop) and 500 is the honest response.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode(course.name);
    const existing = await repo.findJoinCode(env.DB, code);
    if (existing) continue;
    const row = await repo.createJoinCode(env.DB, {
      code,
      courseId,
      emailDomain,
      expiresAt,
      maxUses,
      createdBy: gate.user.id,
    });
    await repo.appendAuditLog(env.DB, {
      actorId: gate.user.id,
      action: "joinCode.create",
      targetKind: "join_code",
      targetId: code,
      payload: { courseId, emailDomain, maxUses, expiresAt },
    });
    return json(
      {
        code: row.code,
        emailDomain: row.email_domain,
        expiresAt: row.expires_at,
        maxUses: row.max_uses,
        uses: 0,
        createdAt: row.created_at,
        revokedAt: null,
      },
      201,
    );
  }
  return error("Failed to allocate a unique code; try again", 500);
}

async function revokeJoinCodeRoute(
  env: Env,
  identity: Identity,
  courseId: string,
  code: string,
): Promise<Response> {
  const gate = await requireInstructor(env, identity, courseId);
  if (gate instanceof Response) return gate;
  const existing = await repo.findJoinCode(env.DB, code);
  if (!existing || existing.course_id !== courseId) {
    return error("Code not found", 404);
  }
  if (existing.revoked_at) {
    return json({ code, revokedAt: existing.revoked_at });
  }
  await repo.revokeJoinCode(env.DB, code, courseId);
  await repo.appendAuditLog(env.DB, {
    actorId: gate.user.id,
    action: "joinCode.revoke",
    targetKind: "join_code",
    targetId: code,
    payload: { courseId },
  });
  return json({ code, revokedAt: Date.now() });
}

/**
 * POST /api/join/:code — signed-in user claims a code and is enrolled as a
 * student in the associated course. Idempotent for the caller: re-using a
 * code they've already claimed returns their existing enrollment unchanged
 * (does NOT bump `uses`). Codes never downgrade an existing instructor.
 */
async function claimJoinCodeRoute(
  env: Env,
  identity: Identity,
  code: string,
): Promise<Response> {
  const codeRow = await repo.findJoinCode(env.DB, code);
  if (!codeRow) return error("Invalid join code", 404);
  if (codeRow.revoked_at) {
    return error("This code has been revoked. Ask your instructor for a new one.", 410);
  }
  if (codeRow.expires_at !== null && codeRow.expires_at <= Date.now()) {
    return error("This code has expired. Ask your instructor for a new one.", 410);
  }
  if (codeRow.max_uses !== null && codeRow.uses >= codeRow.max_uses) {
    return error("This code has reached its use limit.", 410);
  }
  // v0.7 §3.12 — domain gate is now instance-wide via
  // ALLOWED_EMAIL_DOMAINS, with INSTANCE_ADMIN_EMAILS domains implicitly
  // trusted. Legacy per-code email_domain rows (created before this
  // deploy) still apply on top so a code generated with a specific
  // domain restriction keeps that restriction.
  const email = identity.email;
  const dom = emailDomainOf(email);
  if (codeRow.email_domain && dom !== codeRow.email_domain.toLowerCase()) {
    return error(
      `This code requires an @${codeRow.email_domain} account; you're signed in as ${email}. Sign out and retry with the right account.`,
      403,
    );
  }
  const allowed = allowedEmailDomains(env);
  if (allowed.size > 0 && !allowed.has(dom)) {
    const list = [...allowed].map((d) => `@${d}`).join(", ");
    return error(
      `Your email (${email}) isn't on this instance's allowed-domain list (${list}). Ask an admin to update ALLOWED_EMAIL_DOMAINS.`,
      403,
    );
  }

  // In production identity.userId is always populated (OIDC callback
  // creates the row before issuing the session). Dev bypass for a brand-
  // new email is the only path that lands here without a row.
  let userId = identity.userId;
  if (!userId) {
    const user = await repo.findUserByEmail(env.DB, DEFAULT_ORG, email);
    if (!user) return error("Unknown user", 403);
    userId = user.id;
  }

  try {
    const { enrollment, alreadyEnrolled } = await repo.claimJoinCode(env.DB, {
      code: codeRow,
      userId,
    });
    return json(
      {
        courseId: enrollment.course_id,
        role: enrollment.role,
        alreadyEnrolled,
      },
      alreadyEnrolled ? 200 : 201,
    );
  } catch (err) {
    return error(err instanceof Error ? err.message : "Claim failed", 409);
  }
}

// ─── admin (v0.6 §5) ───────────────────────────────────────────────────────

async function adminRoute(
  req: Request,
  env: Env,
  _ctx: ExecutionContext,
  _url: URL,
  identity: Identity,
  parts: string[],
): Promise<Response> {
  if (!identity.isAdmin || !identity.userId) {
    return error("Admin only", 403);
  }
  const [, , section, idSeg] = parts; // ["api", "admin", section, idSeg?]

  if (section === "courses") {
    if (req.method === "GET" && parts.length === 3) {
      return listCoursesAdmin(env);
    }
    if (req.method === "POST" && parts.length === 3) {
      return createCourseAdmin(req, env, identity);
    }
    if (req.method === "DELETE" && parts.length === 4 && idSeg) {
      return deleteCourseAdmin(env, identity, idSeg);
    }
  }
  if (section === "admins") {
    if (req.method === "GET" && parts.length === 3) {
      return listAdminsAdmin(env);
    }
    if (req.method === "POST" && parts.length === 3) {
      return promoteAdminAdmin(req, env, identity);
    }
    if (req.method === "DELETE" && parts.length === 4 && idSeg) {
      return demoteAdminAdmin(env, identity, idSeg);
    }
  }
  if (section === "users") {
    if (req.method === "GET" && parts.length === 3) {
      return listUsersAdmin(req, env);
    }
    if (req.method === "GET" && parts.length === 4 && idSeg) {
      return getUserAdmin(env, idSeg);
    }
  }
  if (section === "audit-log" && req.method === "GET" && parts.length === 3) {
    return listAuditLogAdmin(req, env);
  }
  return error("Not found", 404);
}

async function listCoursesAdmin(env: Env): Promise<Response> {
  const rows = await repo.listCoursesWithEnrollmentCounts(env.DB, DEFAULT_ORG);
  return json({ courses: rows });
}

async function createCourseAdmin(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
  } | null;
  const name = body?.name?.trim();
  if (!name) return error("name is required", 400);
  const row = await repo.createCourse(env.DB, { orgId: DEFAULT_ORG, name });
  await repo.appendAuditLog(env.DB, {
    actorId: identity.userId!,
    action: "course.create",
    targetKind: "course",
    targetId: row.id,
    payload: { name },
  });
  return json({ id: row.id, name: row.name, createdAt: row.created_at }, 201);
}

/**
 * Cascade-delete a course: agents (with conversation orphan preservation),
 * collections, sources, voices, join codes, enrollments, course row. R2
 * blobs and Vectorize vectors are removed here because the worker handle
 * has those bindings.
 */
async function deleteCourseAdmin(
  env: Env,
  identity: Identity,
  courseId: string,
): Promise<Response> {
  const course = await repo.findCourseById(env.DB, courseId);
  if (!course) return error("Course not found", 404);

  const { collectionIds, sourceIds } = await repo.deleteCourseCascade(
    env.DB,
    courseId,
  );

  // R2: delete every source blob under this course's namespace. Keys are
  // `${courseId}/${collectionId}/...` so a prefix scan picks them up.
  // R2.list is paginated; loop until exhausted.
  let cursor: string | undefined;
  do {
    const page = await env.SOURCES.list({
      prefix: `${courseId}/`,
      cursor,
    });
    if (page.objects.length > 0) {
      await env.SOURCES.delete(page.objects.map((o) => o.key));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  // Vectorize: reconstruct the chunk id space we used for these sources and
  // best-effort delete. Same logic as dropSourceVectors above; pull
  // MAX_CHUNKS_PER_SOURCE as the upper bound since we no longer have the
  // per-source row to read `chunks` from.
  const ids: string[] = [];
  for (const sourceId of sourceIds) {
    for (let i = 0; i < MAX_CHUNKS_PER_SOURCE; i++) {
      ids.push(`${sourceId}:${i}`);
    }
  }
  // Vectorize accepts up to ~1000 ids per call. Chunk.
  for (let i = 0; i < ids.length; i += 1000) {
    await env.VECTORIZE.deleteByIds(ids.slice(i, i + 1000)).catch((err) => {
      console.warn("Vectorize deleteByIds failed during course cascade:", err);
    });
  }

  await repo.appendAuditLog(env.DB, {
    actorId: identity.userId!,
    action: "course.delete",
    targetKind: "course",
    targetId: courseId,
    payload: {
      name: course.name,
      collectionsRemoved: collectionIds.length,
      sourcesRemoved: sourceIds.length,
    },
  });
  return new Response(null, { status: 204 });
}

async function listAdminsAdmin(env: Env): Promise<Response> {
  const rows = await repo.listAdmins(env.DB, DEFAULT_ORG);
  return json({
    admins: rows.map((r) => ({
      userId: r.id,
      email: r.email,
      displayName: r.display_name,
      lastSeenAt: r.last_seen_at,
    })),
  });
}

async function promoteAdminAdmin(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
  } | null;
  const targetEmail = body?.email?.trim().toLowerCase();
  if (!targetEmail) return error("email is required", 400);
  const target = await repo.findUserByEmail(env.DB, DEFAULT_ORG, targetEmail);
  if (!target) {
    return error(
      "User hasn't signed in yet. They must sign in once before being promoted to admin.",
      404,
    );
  }
  if (target.is_admin === 1) {
    return json({ userId: target.id, alreadyAdmin: true });
  }
  await repo.setUserAdmin(env.DB, target.id, true);
  await repo.appendAuditLog(env.DB, {
    actorId: identity.userId!,
    action: "admin.promote",
    targetKind: "user",
    targetId: target.id,
    payload: { email: target.email },
  });
  return json({ userId: target.id, email: target.email });
}

async function demoteAdminAdmin(
  env: Env,
  identity: Identity,
  userId: string,
): Promise<Response> {
  // v0.4 §10 self-protection rule, mirrored at instance scope: an admin
  // cannot revoke their own admin status. Recovery from a stuck "no admins"
  // state is the INSTANCE_ADMIN_EMAILS env floor — edit + redeploy.
  if (userId === identity.userId) {
    return error(
      "You can't revoke your own admin. Ask another admin, or edit INSTANCE_ADMIN_EMAILS and redeploy.",
      409,
    );
  }
  const target = await repo.findUserById(env.DB, userId);
  if (!target) return error("User not found", 404);
  if (target.is_admin === 0) {
    return json({ userId, alreadyDemoted: true });
  }
  await repo.setUserAdmin(env.DB, userId, false);
  await repo.appendAuditLog(env.DB, {
    actorId: identity.userId!,
    action: "admin.demote",
    targetKind: "user",
    targetId: userId,
    payload: { email: target.email },
  });
  return json({ userId, demoted: true });
}

async function listUsersAdmin(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 100, 1),
    500,
  );
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const rows = await repo.listUsersForAdmin(env.DB, DEFAULT_ORG, limit, offset);
  return json({
    users: rows.map((r) => ({
      userId: r.id,
      email: r.email,
      displayName: r.display_name,
      lastSeenAt: r.last_seen_at,
      isAdmin: r.is_admin === 1,
      externalProvider: r.external_provider,
      enrollmentCount: r.enrollment_count,
      createdAt: r.created_at,
    })),
  });
}

/**
 * Per-user detail view (v0.7 §3.8). Returns the user, their enrollments
 * across every course (with course name), and a recent audit-log slice
 * involving them as actor or target. Admin-only — instructor-scoped
 * editing still flows through the per-course roster endpoints.
 */
async function getUserAdmin(env: Env, userId: string): Promise<Response> {
  const [user, enrollments, audit] = await Promise.all([
    repo.findUserById(env.DB, userId),
    repo.listEnrollmentsForUserEnriched(env.DB, userId),
    repo.listAuditLogForUser(env.DB, userId, 50),
  ]);
  if (!user) return error("User not found", 404);
  return json({
    user: {
      userId: user.id,
      email: user.email,
      displayName: user.display_name,
      lastSeenAt: user.last_seen_at,
      createdAt: user.created_at,
      isAdmin: user.is_admin === 1,
      externalProvider: user.external_provider,
    },
    enrollments,
    audit: audit.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      action: r.action,
      targetKind: r.target_kind,
      targetId: r.target_id,
      payload: r.payload === null ? null : safeJsonParse(r.payload),
      createdAt: r.created_at,
    })),
  });
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

async function listAuditLogAdmin(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 100, 1),
    500,
  );
  const rows = await repo.listAuditLog(env.DB, limit);
  return json({
    entries: rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      action: r.action,
      targetKind: r.target_kind,
      targetId: r.target_id,
      payload: r.payload ? JSON.parse(r.payload) : null,
      createdAt: r.created_at,
    })),
  });
}

// ─── conversations ─────────────────────────────────────────────────────────

/**
 * POST /api/conversations — combined "create + first turn" endpoint (v0.4 §14).
 *
 * Pre-§14 this returned `{conversationId, agent, state}` and required the
 * client to immediately POST a follow-up to /:id/messages. That created a
 * wasteful empty row whenever a student clicked Start and never typed —
 * polluting the history sidebar and the per-agent "in-progress" gate (§13).
 *
 * The new flow takes the first user message in the same request body, then:
 *   1. Resolves user + agent + enrollment (same checks as before).
 *   2. Snapshots the definition; builds initial backbone state.
 *   3. Writes the conversation row.
 *   4. Emits a `started { conversationId, agent, state, currentTopic }` SSE
 *      event so the client can swap its URL from /new/:agentId to /c/:id
 *      (via navigate replace, so back-button doesn't loop).
 *   5. Runs the first turn via the shared streamTurn() helper — same
 *      delta/done/error events as POST /messages for turns 2..N.
 *
 * If anything between resolve and streamTurn throws, no row exists. If a
 * provider failure mid-stream leaves the row with zero messages, the next
 * list/get just shows "Untitled" — acceptable, recoverable on retry.
 */
async function startConversation(
  req: Request,
  env: Env,
  identity: Identity,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    courseId?: string;
    agentId?: string;
    content?: string;
  } | null;
  if (!body?.agentId || !body?.content) {
    return error("agentId and content are required", 400);
  }
  const content = body.content.trim();
  if (!content) return error("content is required", 400);
  if (content.length > MAX_MESSAGE_CHARS) {
    return error(
      `Message exceeds ${MAX_MESSAGE_CHARS} characters; please shorten it.`,
      413,
    );
  }

  // v1.0 §7.1 — courseId is optional. When absent, infer it from the
  // agent row. Either way, the caller must be enrolled in the agent's
  // course before we'll start a conversation against it.
  const agent = body.courseId
    ? await repo.getAgent(env.DB, body.courseId, body.agentId)
    : await repo.findAgentById(env.DB, body.agentId);
  if (!agent) return error("Agent not found", 404);
  const courseId = agent.course_id;
  const resolved = await resolveUser(env, identity.email, courseId, identity.userId);
  if (!resolved) return error("Not enrolled in this course", 403);

  // Snapshot the definition into the conversation row. If the instructor
  // edits the agent mid-flight, in-progress conversations keep running
  // against the version they started with — no silent model upgrades, no
  // backbone-state desync, no swapped collection.
  //
  // v0.7 §1.2 — if the agent stores a `custom-ref` voice, materialise it
  // into an inline `custom` here so the snapshot carries the prompt
  // fragment, not a pointer. Future edits to the voice don't reach into
  // this conversation; the agent's *next* conversation will materialise
  // fresh against the then-current fragment.
  const def = JSON.parse(agent.definition) as AgentDefinition;
  if (def.voice.kind === "custom-ref") {
    const v = await repo.findVoiceById(env.DB, def.voice.voiceId);
    if (!v) {
      return error(
        "This agent's voice was deleted. Ask the author to fix it.",
        409,
      );
    }
    // Defense-in-depth: the agent's instructor must still be able to use
    // this voice (own it or have it shared with them). validateAgentDefinition
    // checks this at save time, but a voice owner can revoke a share *after*
    // an agent was built against it — in which case we shouldn't keep
    // materialising it on new conversations. Past conversations are already
    // inlined and unaffected.
    //
    // Find the agent's owning instructor by reading the course roster. With
    // multiple instructors we accept the voice if any of them can use it.
    const courseInstructors = await repo.listRosterForCourse(env.DB, courseId);
    const instructorIds = courseInstructors
      .filter((r) => r.role === "instructor")
      .map((r) => r.userId);
    let usableByAny = false;
    for (const iid of instructorIds) {
      const usable = await repo.findVoiceUsableByUser(env.DB, v.id, iid);
      if (usable) { usableByAny = true; break; }
    }
    if (!usableByAny) {
      console.warn(
        `Voice ${v.id} referenced by agent ${agent.id} is no longer usable by ` +
        `any instructor on course ${courseId}. Continuing with materialised ` +
        `snapshot but the agent should be re-saved or deleted.`,
      );
    }
    def.voice = {
      kind: "custom",
      definition: {
        id: v.id,
        name: v.name,
        description: v.description,
        systemPromptFragment: v.system_prompt_fragment,
      },
    };
  }
  const snapshotJson = JSON.stringify(def);
  const state = def.backbone ? initialState() : null;
  const conv = await repo.createConversation(env.DB, {
    courseId,
    userId: resolved.user.id,
    agentId: body.agentId,
    agentTitle: agent.title,
    definitionSnapshot: snapshotJson,
    backboneState: state ? JSON.stringify(state) : null,
  });

  const topicAtStart =
    def.backbone && state ? currentTopic(def.backbone, state) : null;
  const prelude = sse("started", {
    conversationId: conv.id,
    agent: { id: agent.id, title: agent.title },
    state,
    currentTopic: topicAtStart
      ? { title: topicAtStart.title, index: state!.currentTopicIndex }
      : null,
  });

  return streamTurn({
    env,
    conv,
    def,
    state,
    content,
    history: [],
    prelude,
    // If anything between here and commitTurn throws (provider 429, network,
    // bad API key, malformed JSON from Anthropic, etc.), the row we just
    // wrote has zero messages — §14's whole point was to avoid those ghost
    // rows. Hand the helper a cleanup callback that fires only when the
    // first turn fails before any commit.
    cleanupOnFailure: true,
    userId: resolved.user.id,
  });
}

async function getConversation(
  env: Env,
  identity: Identity,
  conversationId: string,
): Promise<Response> {
  // Skip the redundant findUserByEmail when identity.userId is already known
  // from the session JOIN. Fallback covers dev bypass without a row.
  let userId = identity.userId;
  if (!userId) {
    const user = await repo.findUserByEmail(env.DB, DEFAULT_ORG, identity.email);
    if (!user) return error("Unknown user", 403);
    userId = user.id;
  }

  // One query joins the agent so the title comes back in the same row instead
  // of an N+1 second fetch.
  const row = await repo.findConversationByOwnerWithAgent(
    env.DB,
    conversationId,
    userId,
  );
  if (!row) return error("Conversation not found", 404);

  // Confirm the user is still enrolled in the course this conversation
  // belongs to. Stale conversation rows whose owner has since been removed
  // from the course (or whose row leaked from another tenant) won't be readable.
  const enrollment = await repo.findEnrollment(env.DB, row.course_id, userId);
  if (!enrollment) return error("Not enrolled in this course", 403);

  const messages = await repo.listMessages(env.DB, row.course_id, conversationId);
  // v0.5 §3 — citations per assistant message, so pills survive a reload.
  const citationRows = await repo.listConversationCitations(env.DB, conversationId);
  const citationsByMessage = new Map<
    string,
    {
      ordinal: number;
      sourceId: string | null;
      filename: string;
      kind: string;
      sourceUrl: string | null;
      r2Key: string | null;
    }[]
  >();
  for (const c of citationRows) {
    const arr = citationsByMessage.get(c.message_id) ?? [];
    arr.push({
      ordinal: c.ordinal,
      sourceId: c.source_id,
      filename: c.filename,
      kind: c.kind,
      sourceUrl: c.source_url,
      r2Key: c.r2_key,
    });
    citationsByMessage.set(c.message_id, arr);
  }
  const state = row.backbone_state
    ? (JSON.parse(row.backbone_state) as BackboneState)
    : null;

  // Render against the snapshot, not the live agent row, so mid-flight edits
  // don't change the topic outline the student is mid-conversation on.
  const def = JSON.parse(row.definition_snapshot) as AgentDefinition;
  const agentInfo = row.agent_id && row.agent_title
    ? { id: row.agent_id, title: row.agent_title }
    : null;
  let currentTopicInfo: { title: string; index: number } | null = null;
  if (def.backbone && state) {
    const topic = currentTopic(def.backbone, state);
    if (topic) {
      currentTopicInfo = {
        title: topic.title,
        index: state.currentTopicIndex,
      };
    }
  }

  return json({
    conversationId: row.id,
    // v1.0 §7.1 — surfacing courseId here lets ConversationPage build
    // citation URLs without importing the old DEMO_COURSE constant.
    courseId: row.course_id,
    agent: agentInfo,
    // v1.0 — the student-facing clarity line, resolved from the agent
    // snapshot (instructor note, or a default from the agent's shape).
    clarityNote: clarityNoteFor(def),
    state,
    currentTopic: currentTopicInfo,
    completedAt: row.completed_at,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      sources: citationsByMessage.get(m.id),
    })),
  });
}

/**
 * GET /api/conversations — sidebar/history listing.
 *
 * Backbone titles are server-derived from the snapshot + state on every read
 * (no DB write, no title drift on agent rename). Free-chat titles are
 * lazy-generated by the cheapest model on the agent's provider after the
 * first user→assistant exchange; we kick that work off in a `waitUntil` so
 * it never blocks the list response. The row shows "Untitled" until the
 * next refresh.
 */
async function listConversationsRoute(
  env: Env,
  ctx: ExecutionContext,
  identity: Identity,
): Promise<Response> {
  // Skip the redundant findUserByEmail when identity.userId is already known.
  let userId = identity.userId;
  if (!userId) {
    const user = await repo.findUserByEmail(env.DB, DEFAULT_ORG, identity.email);
    if (!user) return error("Unknown user", 403);
    userId = user.id;
  }

  const SIDEBAR_LIMIT = 50;
  const rows = await repo.listConversationsForUser(env.DB, userId, SIDEBAR_LIMIT);

  const items = rows.map((r) => {
    const def = JSON.parse(r.definition_snapshot) as AgentDefinition;
    const state = r.backbone_state
      ? (JSON.parse(r.backbone_state) as BackboneState)
      : null;
    const agentName = r.agent_title ?? "(deleted agent)";

    let derivedTitle: string;
    let topicProgress: { index: number; total: number } | null = null;

    if (def.backbone && state) {
      const total = def.backbone.topics.length;
      const idx = Math.min(state.currentTopicIndex, total - 1);
      topicProgress = { index: idx, total };
      if (state.finished || r.completed_at !== null) {
        derivedTitle = `${agentName} — completed`;
      } else {
        derivedTitle = `${agentName} — topic ${idx + 1}/${total}`;
      }
    } else {
      // Free-chat: use stored title, or null → "Untitled" in the UI.
      derivedTitle = r.title ?? "";
    }

    return {
      id: r.id,
      title: derivedTitle,
      agentName,
      topicProgress,
      completedAt: r.completed_at,
      updatedAt: r.updated_at,
      hasBackbone: !!def.backbone,
    };
  });

  // Lazy title-gen for free-chat rows. Fire-and-forget — don't block the
  // list. Each row carries a `title_attempts` counter; once it hits the cap
  // we leave the title null forever rather than re-firing Haiku on every
  // sidebar refresh. The counter is bumped *before* the LLM call (inside
  // generateConversationTitle) so even a crash mid-call records the attempt.
  for (const r of rows) {
    const def = JSON.parse(r.definition_snapshot) as AgentDefinition;
    if (def.backbone) continue; // backbone titles are derived, never stored
    if (r.title) continue;
    if (r.message_count < 2) continue;
    if (r.title_attempts >= MAX_TITLE_ATTEMPTS) continue;
    ctx.waitUntil(generateConversationTitle(env, r.id, userId, def));
  }

  return json({ conversations: items });
}

/**
 * Generate and persist a short title for a free-chat conversation, using the
 * cheapest model on the agent's provider. Best-effort: any failure leaves
 * `title` null and the next list call will retry.
 */
async function generateConversationTitle(
  env: Env,
  conversationId: string,
  userId: string,
  def: AgentDefinition,
): Promise<void> {
  // Bump the attempt counter *before* the network call so a crash, throw,
  // or empty reply still consumes one of the bounded attempts. The listing
  // loop refuses to re-fire generation once the cap is reached — without
  // this bump a flaky model would re-bill on every sidebar load.
  try {
    await repo.bumpTitleAttempt(env.DB, conversationId, userId);
  } catch (e) {
    console.warn("bumpTitleAttempt failed:", e);
    return;
  }
  try {
    const provider: LLMProvider = new AnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: def.model ?? env.DEFAULT_MODEL,
    });
    if (!provider.titleModel) return; // provider opted out of incidental work
    const titleModel = provider.titleModel();

    const pair = await repo.firstTurnPair(env.DB, conversationId);
    if (!pair.user) return; // nothing to summarize yet

    // Keep input small — title-gen prompt is itself a cost we want to bound.
    const trim = (s: string, n: number) =>
      s.length > n ? s.slice(0, n) + "…" : s;
    const userText = trim(pair.user, 600);
    const assistantText = pair.assistant ? trim(pair.assistant, 600) : "";

    const reply = await provider.chat(
      [
        {
          role: "user",
          content:
            `Conversation excerpt:\n\nStudent: ${userText}\n\n` +
            (assistantText ? `Assistant: ${assistantText}\n\n` : "") +
            `Write a title for this conversation in 6 words or fewer. Output only the title text, no quotes, no trailing punctuation.`,
        },
      ],
      {
        system: {
          instructions:
            "You produce concise conversation titles. Reply with only the title.",
        },
        model: titleModel,
        maxTokens: 32,
        temperature: 0.3,
      },
    );

    const raw = reply.content.trim();
    if (!raw) return;
    // Defensive trim: strip surrounding quotes / trailing period, cap length.
    const cleaned = raw
      .replace(/^["“'']+|["”'']+$/g, "")
      .replace(/[.!?]+$/g, "")
      .slice(0, 80);
    if (!cleaned) return;

    await repo.setConversationTitle(env.DB, conversationId, userId, cleaned);
  } catch (err) {
    console.error("title-gen failed for", conversationId, err);
  }
}

async function postMessage(
  req: Request,
  env: Env,
  identity: Identity,
  conversationId: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { content?: string } | null;
  const content = body?.content?.trim();
  if (!content) return error("content is required", 400);

  // Cap the inbound message. Bounds the cost of the embed-on-every-turn path
  // for RAG and the input tokens to the chat model.
  if (content.length > MAX_MESSAGE_CHARS) {
    return error(
      `Message exceeds ${MAX_MESSAGE_CHARS} characters; please shorten it.`,
      413,
    );
  }

  // Skip redundant findUserByEmail when identity.userId is known.
  let userId = identity.userId;
  if (!userId) {
    const user = await repo.findUserByEmail(env.DB, DEFAULT_ORG, identity.email);
    if (!user) return error("Unknown user", 403);
    userId = user.id;
  }

  const conv = await repo.findConversationByOwner(env.DB, conversationId, userId);
  if (!conv) return error("Conversation not found", 404);
  if (!conv.agent_id) return error("Conversation has no agent", 400);

  // Re-check enrollment on every turn — a user whose enrollment was revoked
  // should not be able to keep driving a conversation row they previously
  // owned. Cheap; D1 indexed lookup.
  const enrollment = await repo.findEnrollment(env.DB, conv.course_id, userId);
  if (!enrollment) return error("Not enrolled in this course", 403);

  // Use the definition snapshot captured at conversation start — not the live
  // agent row — so an instructor edit can't desync state mid-flight.
  const def = JSON.parse(conv.definition_snapshot) as AgentDefinition;
  const state = conv.backbone_state
    ? (JSON.parse(conv.backbone_state) as BackboneState)
    : null;

  // §1: completed conversations are read-only. The schema's completed_at is
  // the authoritative gate (state.finished is the input that sets it on the
  // turn it fires). 422 per spec — the request is well-formed but the resource
  // refuses further turns.
  if (conv.completed_at !== null || state?.finished) {
    return error("This conversation is complete; start a new one", 422);
  }

  // Hard ceiling on turns for agents without a backbone (the backbone state
  // machine bounds the others). Without this a non-backbone "Ask the textbook"
  // agent is unbounded.
  if (!def.backbone && conv.turn_count >= MAX_TURNS_PER_CONVERSATION) {
    return error("Conversation turn limit reached", 409);
  }

  const history = await repo.listMessages(env.DB, conv.course_id, conversationId);
  return streamTurn({ env, conv, def, state, content, history });
}

/**
 * Shared per-turn pipeline (v0.4 §14). Two callers:
 *   1. POST /api/conversations          → first turn against a fresh row,
 *                                          with a `started` event prelude.
 *   2. POST /api/conversations/:id/messages → turns 2..N, no prelude.
 *
 * Caller resolves everything (auth, enrollment, completion gate, history
 * load); this helper handles prompt building, RAG retrieval, provider
 * streaming, backbone transition, atomic commit, and SSE framing.
 */
function streamTurn(params: {
  env: Env;
  conv: import("@marginalia/schema").ConversationRow;
  def: AgentDefinition;
  state: BackboneState | null;
  content: string;
  history: import("@marginalia/schema").MessageRow[];
  /** Pre-serialized SSE frame to emit before the first delta (e.g. `started`). */
  prelude?: string;
  /**
   * §14 ghost-row protection. When true, the conversation row was just
   * created by this same request; if streaming fails before commitTurn lands
   * the row stays with zero messages, so we delete it. Pure subsequent
   * /messages turns leave this false — losing a turn doesn't justify
   * deleting a long-running conversation.
   */
  cleanupOnFailure?: boolean;
  /** Owner of `conv`; required when cleanupOnFailure is true. */
  userId?: string;
}): Response {
  const { env, conv, def, state, content, history, prelude, cleanupOnFailure, userId } = params;

  // Trim history sent to the LLM. Two layered caps:
  //   1. MAX_HISTORY_TURNS — keep at most this many recent messages.
  //   2. MAX_HISTORY_CHARS — drop more oldest messages if the window still
  //      exceeds the char budget. Anthropic input tokens bill every turn for
  //      everything not covered by the cached system prefix, so a verbose
  //      conversation otherwise pays full per-turn cost forever.
  let windowStart = Math.max(0, history.length - MAX_HISTORY_TURNS);
  let runningChars = 0;
  for (let i = history.length - 1; i >= windowStart; i--) {
    runningChars += history[i]!.content.length;
    if (runningChars > MAX_HISTORY_CHARS) {
      windowStart = i + 1;
      break;
    }
  }
  const trimmed = history.slice(windowStart);
  const llmMessages: LLMMessage[] = trimmed.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  llmMessages.push({ role: "user", content });

  const prompt = buildPrompt(def, state);

  const provider: LLMProvider = new AnthropicProvider({
    apiKey: env.ANTHROPIC_API_KEY,
    model: def.model ?? env.DEFAULT_MODEL,
  });

  const abort = new AbortController();
  const encoder = new TextEncoder();
  let raw = "";
  let committed = false;
  // v0.5 §3: captured retrieved chunks for this turn, intersected against
  // the streamed reply to build the citation set after the stream finishes.
  let retrieved: Retrieved[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (prelude) controller.enqueue(encoder.encode(prelude));

        // RAG retrieval (if applicable). Done inside `start` so a slow retrieve
        // doesn't delay the `started` event the client uses to swap URLs.
        if (def.collectionId) {
          try {
            const r = await retrieve(env, def.collectionId, content);
            retrieved = r;
            const block = formatRetrievedContext(r);
            prompt.context = prompt.context ? `${block}\n\n${prompt.context}` : block;
          } catch (err) {
            console.error("RAG retrieval failed:", err);
          }
        }

        for await (const chunk of provider.stream(llmMessages, {
          system: { instructions: prompt.instructions, context: prompt.context },
          signal: abort.signal,
        })) {
          if (chunk.delta) {
            raw += chunk.delta;
            controller.enqueue(
              encoder.encode(sse("delta", { text: stripMarker(chunk.delta) })),
            );
          }
        }

        let nextState: BackboneState | null = state;
        let transitionKind: string = "stay";
        let topicAfter: { title: string; index: number } | null = null;
        let completionMessage: string | null = null;

        if (def.backbone && state) {
          const result = transition(def.backbone, state, raw);
          nextState = result.state;
          transitionKind = result.kind;
          const topic = currentTopic(def.backbone, result.state);
          topicAfter = topic
            ? { title: topic.title, index: result.state.currentTopicIndex }
            : null;
          if (result.state.finished) {
            completionMessage = def.backbone.completionMessage ?? null;
          }
        }

        const reply = cleanReply(raw);

        // v0.5 §3: extract citations the model actually used. The model is
        // told to cite as `[^source-id]`; we accept the bare-id form plus
        // any common bracketed variant the model invents. We intersect the
        // cited ids with what the retriever actually returned so we never
        // surface a hallucinated source pill.
        const citationInputs = await buildCitationInputs(
          env,
          conv.course_id,
          reply,
          retrieved,
        );

        // Atomic commit: user + assistant message rows (seqs computed in-SQL
        // to be race-safe), updated backbone state, turn count, and completed_at
        // all in one D1 batch. If any statement fails, none commit — never a
        // user turn persisted with the assistant reply dropped.
        const finishedNow = nextState?.finished === true;
        const completedAtStamp = finishedNow ? Date.now() : null;
        await repo.commitTurn(env.DB, {
          conversationId: conv.id,
          courseId: conv.course_id,
          userContent: content,
          assistantContent: reply,
          backboneState: nextState ? JSON.stringify(nextState) : null,
          turnCount: conv.turn_count + 1,
          completedAt: completedAtStamp,
          citations: citationInputs,
        });
        committed = true;

        // v0.5 §3: emit the sources event before `done` so the client has
        // the pill data when it flips raw `[^src_*]` tokens into pills.
        if (citationInputs.length > 0) {
          controller.enqueue(
            encoder.encode(
              sse("sources", {
                items: citationInputs.map((c, i) => ({
                  ordinal: i + 1,
                  sourceId: c.sourceId,
                  filename: c.filename,
                  kind: c.kind,
                  sourceUrl: c.sourceUrl,
                  r2Key: c.r2Key,
                })),
              }),
            ),
          );
        }

        controller.enqueue(
          encoder.encode(
            sse("done", {
              state: nextState,
              transition: transitionKind,
              currentTopic: topicAfter,
              // Authoritative server stamp so the client banner / sidebar
              // match D1 even when the user's wall clock is wrong.
              completedAt: completedAtStamp,
              completionMessage,
              // v0.5 §5: current row title (stale by design — generation is a
              // waitUntil fired from listConversations). When this is still
              // null on a free-chat turn the client schedules one delayed
              // sidebar refresh to pick up the generated title.
              conversationTitle: conv.title,
            }),
          ),
        );
        controller.close();
      } catch (err) {
        const message =
          err instanceof ProviderError ? err.message : "stream failed";
        // §14: if this stream owns the conversation row and never landed a
        // commit, the row is a ghost — kill it so it doesn't pollute the
        // sidebar or the §13 per-agent "in-progress" gate.
        if (cleanupOnFailure && userId && !committed) {
          await repo.deleteEmptyConversation(env.DB, conv.id, userId)
            .catch((e) => console.warn("ghost-row cleanup failed:", e));
        }
        controller.enqueue(encoder.encode(sse("error", { message })));
        controller.close();
      }
    },
    async cancel() {
      // Client navigated away or aborted. Stop billing Anthropic for the rest
      // of the stream. Partial deltas have already been delivered; the row
      // gets the same ghost-row cleanup as a failure path because nothing
      // committed.
      abort.abort();
      if (cleanupOnFailure && userId && !committed) {
        await repo.deleteEmptyConversation(env.DB, conv.id, userId)
          .catch((e) => console.warn("ghost-row cleanup failed on cancel:", e));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

/** Server-sent-event frame. */
function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Drop the advance marker from a streamed delta. */
function stripMarker(delta: string): string {
  return delta.replace(/\[ADVANCE\]/g, "");
}

/**
 * v0.5 §3 — find the source ids the model cited in `raw`, intersect with
 * what was actually retrieved (so a hallucinated `[^src_<uuid>]` doesn't
 * surface a pill), and resolve display fields from collection_sources.
 *
 * Order matters: pill numbering is first-cited = 1, deduped by id.
 */
const CITATION_RE = /\[\^?(src_[0-9a-f-]{36})\]/g;
async function buildCitationInputs(
  env: Env,
  courseId: string,
  reply: string,
  retrieved: Retrieved[],
): Promise<repo.CitationInput[]> {
  if (retrieved.length === 0) return [];
  const retrievedIds = new Set(retrieved.map((r) => r.sourceId));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of reply.matchAll(CITATION_RE)) {
    const id = m[1]!;
    if (!retrievedIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  if (ordered.length === 0) return [];
  const rows = await repo.getCollectionSourcesByIds(env.DB, courseId, ordered);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ordered.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        sourceId: row.id,
        filename: row.filename,
        kind: row.kind,
        sourceUrl: row.source_url,
        r2Key: row.r2_key,
      },
    ];
  });
}
