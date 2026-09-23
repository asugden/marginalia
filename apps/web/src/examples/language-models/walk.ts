// Stepping through a generation, one word at a time.
//
//   start    the text so far, with a gap at its end
//   options  the possible next words and their probabilities
//   rolling  the draw: the column spins and slows
//   landed   the drawn word sits in the gap
//   done     every step taken
//
// From `landed`, the next advance adds the word and shows the next options
// at once, so each word costs two presses: draw it, then add it.
//
// The walk lands on a fixed word at every step so it is the same every time
// it is shown. The rolling on the way there is drawn with the step's own
// probabilities, so likely words flash past more often.

import { useCallback, useEffect, useRef, useState } from "react";

export type Phase = "start" | "options" | "rolling" | "landed" | "done";

export function useWalk(steps: { probs: number[]; pick: number }[]) {
  const [taken, setTaken] = useState(0);
  const [phase, setPhase] = useState<Phase>("start");
  const [onLine, setOnLine] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);

  const reset = useCallback(() => {
    clear();
    setTaken(0);
    setPhase("start");
    setOnLine(null);
  }, []);

  const roll = useCallback(
    (step: { probs: number[]; pick: number }) => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce || step.probs.length === 1) {
        setOnLine(step.pick);
        setPhase("landed");
        return;
      }
      setPhase("rolling");
      const delays = [70, 80, 90, 105, 125, 150, 185, 230, 290];
      let t = 0;
      let last = -1;
      delays.forEach((d, k) => {
        t += d;
        const final = k === delays.length - 1;
        const i = final ? step.pick : weighted(step.probs, last);
        last = i;
        timers.current.push(
          window.setTimeout(() => {
            setOnLine(i);
            if (final) setPhase("landed");
          }, t),
        );
      });
    },
    [],
  );

  const advance = useCallback(() => {
    if (phase === "start") setPhase("options");
    else if (phase === "options") roll(steps[taken]!);
    else if (phase === "landed") {
      const next = taken + 1;
      setTaken(next);
      setOnLine(null);
      setPhase(next >= steps.length ? "done" : "options");
    }
  }, [phase, roll, steps, taken]);

  return { taken, phase, onLine, advance, reset };
}

/** A weighted draw that avoids repeating the previous row, so the roll moves. */
function weighted(probs: number[], avoid: number): number {
  const total = probs.reduce((s, p, i) => (i === avoid ? s : s + p), 0);
  let r = Math.random() * total;
  for (let i = 0; i < probs.length; i++) {
    if (i === avoid) continue;
    r -= probs[i]!;
    if (r <= 0) return i;
  }
  return probs.length - 1 === avoid ? 0 : probs.length - 1;
}
