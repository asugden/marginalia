// The guided tour, as a small panel pinned to the corner of every course
// surface — instructor pages, student pages, the writing editor, notebooks.
//
// Each step names a side. Moving to a step switches the session to match
// BEFORE navigating: "student" steps run as the course's sample student (a
// real student account, so the page is exactly what students get), and
// "instructor" steps leave the preview. The instructor never has to manage
// which view they're in; the panel says which one they're looking at.
//
// Progress is server-side and belongs to the real user even mid-preview, so
// the panel survives the identity switch, reloads, and other devices.

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setActingAsStudent } from "../../../client.js";
import { getProgress, saveProgress, type OnboardingProgress } from "../api.js";
import { normalizePreset } from "../presets.js";
import { DESCRIPTORS } from "../registry.js";
import { PRODUCT } from "../setup.js";
import { buildTour, setupEnv } from "../tour.js";
import type { Preset, TourStep } from "../types.js";

const COLLAPSED_KEY = "onboarding.tour.collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable — the panel just won't remember */
  }
}

function toPreset(p: Partial<Preset>): Preset {
  return normalizePreset({
    stance: p.stance ?? "open",
    features: Array.isArray(p.features) ? p.features : [],
    codeChat: p.codeChat,
  });
}

export function TourPanel({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getProgress(courseId, ctrl.signal)
      .then((p) => !ctrl.signal.aborted && setProgress(p))
      .catch(() => {
        /* no tour is a fine outcome */
      });
    return () => ctrl.abort();
  }, [courseId]);

  if (!progress || progress.dismissedAt || progress.completedAt) return null;

  const env = setupEnv(courseId, PRODUCT, toPreset(progress.preset), DESCRIPTORS);
  const steps = buildTour(env, progress.context ?? {}, DESCRIPTORS);
  const index = Math.min(progress.step, steps.length - 1);
  const step = steps[index]!;
  // On the step's page, or somewhere inside it (a document opened from the
  // writing list, say).
  const here =
    location.pathname === step.route || location.pathname.startsWith(step.route + "/");

  async function goTo(i: number, target: TourStep) {
    if (moving) return;
    setMoving(true);
    setError(null);
    try {
      // Switch sides first, so the destination loads as the right person.
      await setActingAsStudent(target.side === "student", courseId);
      const saved = await saveProgress(courseId, { step: i });
      if (saved) setProgress(saved);
      navigate(target.route);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't move to that step");
    } finally {
      setMoving(false);
    }
  }

  async function finish(dismissed: boolean) {
    setError(null);
    try {
      // Leaving the tour leaves any preview too, and lands back as instructor.
      await setActingAsStudent(false);
      const saved = await saveProgress(
        courseId,
        dismissed ? { dismissed: true } : { completed: true },
      );
      setProgress(saved);
      if (!location.pathname.startsWith(`/course/${courseId}/instructor`)) {
        navigate(`/course/${courseId}/instructor`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't close the tour");
    }
  }

  const next = steps[index + 1];
  const prev = index > 0 ? steps[index - 1] : undefined;
  const sideLabel = step.side === "student" ? "You're the sample student" : "You're the instructor";

  if (collapsed) {
    return (
      <button
        type="button"
        className="app-tour app-tour--collapsed"
        onClick={() => {
          setCollapsed(false);
          writeCollapsed(false);
        }}
      >
        Tour · {index + 1}/{steps.length}
      </button>
    );
  }

  return (
    <aside className="app-tour" aria-label="Guided tour">
      <div className="app-tour__head">
        <span className="app-tour__count">
          Tour · {index + 1} of {steps.length}
        </span>
        <span className={"app-tour__side app-tour__side--" + step.side}>{sideLabel}</span>
        <button
          type="button"
          className="app-tour__icon"
          aria-label="Minimize tour"
          onClick={() => {
            setCollapsed(true);
            writeCollapsed(true);
          }}
        >
          –
        </button>
      </div>
      <b className="app-tour__title">{step.title}</b>
      <p className="app-tour__body">{step.body}</p>
      {error && <p className="error small">{error}</p>}
      <div className="app-tour__actions">
        {!here && (
          <button
            type="button"
            className="app-tour__btn"
            disabled={moving}
            onClick={() => void goTo(index, step)}
          >
            Take me there
          </button>
        )}
        {prev && (
          <button
            type="button"
            className="app-tour__btn app-tour__btn--quiet"
            disabled={moving}
            onClick={() => void goTo(index - 1, prev)}
          >
            Back
          </button>
        )}
        {next ? (
          <button
            type="button"
            className="app-tour__btn app-tour__btn--primary"
            disabled={moving}
            onClick={() => void goTo(index + 1, next)}
          >
            Next: {next.title}
          </button>
        ) : (
          <button
            type="button"
            className="app-tour__btn app-tour__btn--primary"
            disabled={moving}
            onClick={() => void finish(false)}
          >
            Finish tour
          </button>
        )}
      </div>
      <button
        type="button"
        className="app-tour__end"
        onClick={() => void finish(true)}
      >
        End the tour
      </button>
    </aside>
  );
}
