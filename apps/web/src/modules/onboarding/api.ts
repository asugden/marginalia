// Typed fetch wrappers for /api/onboarding/*.
// Mirrors apps/worker/src/modules/onboarding/handlers.ts.

import type { Preset, SetupContext } from "./types.js";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;
const fetchInit: RequestInit = API_BASE ? { credentials: "include" } : {};

export interface OnboardingProgress {
  courseId: string;
  preset: Partial<Preset>;
  context: SetupContext;
  step: number;
  completedAt: number | null;
  dismissedAt: number | null;
}

async function fail(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return new Error(body.error);
  } catch {
    /* fall through */
  }
  return new Error(`${res.status} ${res.statusText}`);
}

export async function getProgress(
  courseId: string,
  signal?: AbortSignal,
): Promise<OnboardingProgress | null> {
  const res = await fetch(
    apiUrl(`/api/onboarding/progress?courseId=${encodeURIComponent(courseId)}`),
    { ...fetchInit, signal },
  );
  // Not course staff (a student, or a sample-student session with no real
  // staff user behind it) — there is simply no tour.
  if (res.status === 403) return null;
  if (!res.ok) throw await fail(res);
  return ((await res.json()) as { progress: OnboardingProgress | null }).progress;
}

export async function saveProgress(
  courseId: string,
  patch: {
    preset?: Preset;
    context?: SetupContext;
    step?: number;
    completed?: boolean;
    dismissed?: boolean;
  },
): Promise<OnboardingProgress | null> {
  const res = await fetch(apiUrl(`/api/onboarding/progress`), {
    ...fetchInit,
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId, ...patch }),
  });
  if (!res.ok) throw await fail(res);
  return ((await res.json()) as { progress: OnboardingProgress | null }).progress;
}
