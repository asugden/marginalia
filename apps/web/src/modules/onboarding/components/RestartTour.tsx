// "Restart the guided tour" — shown in a course's Settings when the caller has
// taken (or skipped) its tour. Rewinds progress to the first step and goes
// there; the TourPanel picks it up. Renders nothing for a course set up
// without the guided flow.

import { useEffect, useState } from "react";
import { setActingAsStudent } from "../../../client.js";
import { Button, Section } from "../../../components/index.js";
import { getProgress, saveProgress, type OnboardingProgress } from "../api.js";
import { normalizePreset } from "../presets.js";
import { DESCRIPTORS } from "../registry.js";
import { PRODUCT } from "../setup.js";
import { buildTour, setupEnv } from "../tour.js";

export function RestartTour({ courseId }: { courseId: string }) {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getProgress(courseId, ctrl.signal)
      .then((p) => !ctrl.signal.aborted && setProgress(p))
      .catch(() => {});
    return () => ctrl.abort();
  }, [courseId]);

  if (!progress) return null;

  async function restart() {
    setBusy(true);
    setError(null);
    try {
      await saveProgress(courseId, { step: 0, dismissed: false, completed: false });
      const preset = normalizePreset({
        stance: progress!.preset.stance ?? "open",
        features: progress!.preset.features ?? [],
        codeChat: progress!.preset.codeChat,
      });
      const first = buildTour(setupEnv(courseId, PRODUCT, preset, DESCRIPTORS), progress!.context, DESCRIPTORS)[0]!;
      await setActingAsStudent(first.side === "student", courseId);
      // A full navigation so the panel (mounted by the layout) reloads progress.
      window.location.assign(first.route);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restart the tour");
      setBusy(false);
    }
  }

  return (
    <Section
      title="Guided tour"
      description="Walk through this course again from both sides — yours and a student's."
    >
      {error && <p className="error">{error}</p>}
      <Button variant="subtle" onClick={() => void restart()} loading={busy} disabled={busy}>
        Restart the tour
      </Button>
    </Section>
  );
}
