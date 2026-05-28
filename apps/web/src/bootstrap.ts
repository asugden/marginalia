// v0.7 §2 — read the server-injected bootstrap payload, if any.
//
// The worker may splice
//   <script>window.__BOOTSTRAP__ = {...}; window.__BOOTSTRAP_AT__ = ts;</script>
// into the HTML response for "/". The home page reads it synchronously
// on mount to skip the /api/agents network round-trip on cold load.
//
// The bootstrap is purely additive — if it's missing or malformed, the
// page falls back to the normal useEffect-driven fetch path. Pages that
// consume the bootstrap MUST tolerate it being absent (mock mode, dev
// without the worker, second-page navigations after the data has gone
// stale, etc.).

import type { AgentSummary, MeEnrollment } from "./client.js";

/** v1.0 §2 — the bootstrap is one of three shapes:
 *   * `agents` — single enrollment, agent list inlined. Same as v0.7.
 *   * `picker` — multiple enrollments, no agent list yet; SPA renders
 *     the picker server-side-first.
 *   * absent — unauthenticated, zero enrollments, or fetch failed.
 * The discriminator is `kind`. v0.7-shaped payloads (no `kind`) are
 * still accepted as `agents` so a stale browser cache or an in-flight
 * deploy doesn't break the page. */
export type BootstrapPayload =
  | { kind: "agents"; courseId: string; agents: AgentSummary[] }
  | { kind: "picker"; enrollments: MeEnrollment[] };

declare global {
  interface Window {
    __BOOTSTRAP__?: unknown;
    __BOOTSTRAP_AT__?: number;
  }
}

export function readBootstrap(): BootstrapPayload | null {
  const raw = typeof window !== "undefined" ? window.__BOOTSTRAP__ : undefined;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { kind?: string } & Record<string, unknown>;
  // v0.7 shape: no kind, but has courseId + agents.
  if (
    !obj.kind &&
    typeof obj.courseId === "string" &&
    Array.isArray(obj.agents)
  ) {
    return { kind: "agents", courseId: obj.courseId, agents: obj.agents as AgentSummary[] };
  }
  if (
    obj.kind === "agents" &&
    typeof obj.courseId === "string" &&
    Array.isArray(obj.agents)
  ) {
    return { kind: "agents", courseId: obj.courseId, agents: obj.agents as AgentSummary[] };
  }
  if (obj.kind === "picker" && Array.isArray(obj.enrollments)) {
    return { kind: "picker", enrollments: obj.enrollments as MeEnrollment[] };
  }
  return null;
}

/**
 * Debug-only performance logging. Activated by ?perf=1 in the URL.
 * Dumps to the console; never beacons anywhere. v0.7 §2 / §3.14 open
 * question — chosen over always-on RUM as a privacy + no-telemetry call.
 */
function perfEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("perf");
  } catch {
    return false;
  }
}
export function logPerf(label: string, data?: Record<string, unknown>): void {
  if (!perfEnabled()) return;
  // Include navigationStart-relative time so logs across loads compare.
  const t = Math.round(performance.now());
  // eslint-disable-next-line no-console
  console.log(`[perf @ ${t}ms] ${label}`, data ?? {});
}
