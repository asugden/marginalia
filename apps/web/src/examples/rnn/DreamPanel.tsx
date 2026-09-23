// Lights off.
//
// The sentence ends and Pac-Man keeps walking, into a stretch of corridor
// with nothing in it. No word comes in — the input is zero — but the loop
// still turns: h_{t+1} = tanh(Wh·h_t + b). The strips above his head keep
// changing, then settle, and the verdict he would give keeps drifting for a
// while after the last word he actually read. All of this is the trained
// plain network, stepped with nothing to eat.
//
// The point is a forward reference. A loop that keeps producing states with
// no input is exactly what a brain does asleep, and a later example about
// dreams will pick this figure up again.

import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/index.js";
import { Corridor, Meter, VStrip } from "./Corridor.js";
import { maxAbs, plainStep, readout, type Models, type PlainRun } from "./rnn.js";

const BEYOND = 12;

export function DreamPanel({ models, run, tokens }: { models: Models; run: PlainRun; tokens: string[] }) {
  const T = tokens.length;
  const [step, setStep] = useState(T);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setStep(T), [T]);

  // Keep stepping with x = 0.
  const dark = useMemo(() => {
    const m = models.plain;
    const zero = new Float32Array(m.D);
    const hs = [...run.hs];
    for (let k = 0; k < BEYOND; k++) hs.push(plainStep(m, zero, hs[hs.length - 1]!));
    return { hs, ps: hs.map((h) => readout(m, h)) };
  }, [models, run]);
  const bound = maxAbs(dark.hs);

  useEffect(() => {
    if (!playing) return;
    if (step >= T + BEYOND) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setStep((s) => s + 1), 420);
    return () => window.clearTimeout(id);
  }, [playing, step, T]);

  const k = Math.max(0, step - T);
  const settled = k > 0 && Math.abs(dark.ps[step]! - dark.ps[step - 1]!) < 0.005;

  return (
    <>
      <div className="rn-controls">
        <Button size="sm" variant="subtle" onClick={() => { setPlaying(false); setStep(T); }}>
          back to the last word
        </Button>
        <Button size="sm" variant={playing ? "subtle" : "primary"} onClick={() => setPlaying((p) => !p)} disabled={!playing && step >= T + BEYOND}>
          {playing ? "pause" : step >= T + BEYOND ? "done" : "walk into the dark"}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => setStep((s) => Math.min(T + BEYOND, s + 1))} disabled={step >= T + BEYOND}>
          one step
        </Button>
      </div>
      <div className="tf-figwrap">
        <Corridor
          tokens={tokens}
          step={step}
          onStep={(t) => { setPlaying(false); setStep(t); }}
          beyond={BEYOND}
          aboveH={96}
          labels={[
            { y: 30, text: "what he carries" },
            { y: 90, text: "verdict" },
          ]}
          above={(t, x) =>
            t === 0 ? (
              <rect className="rn-empty" x={x - 5} y={4} width={10} height={59} rx={2} />
            ) : (
              <>
                <VStrip v={dark.hs[t]!} bound={bound} x={x} y={4} faded={t > T} />
                <Meter p={dark.ps[t]!} x={x} y={72} />
              </>
            )
          }
          ariaLabel="The corridor continues past the last word into a dark stretch with no pellets; the carried strips keep changing as Pac-Man walks with nothing to eat."
        />
      </div>
      <p className="tf-readout">
        {k === 0 ? (
          <>
            The sentence is over. Nothing is left to eat. Walk on anyway: the loop does not know
            the corridor is empty, and it will keep turning.
          </>
        ) : (
          <>
            <b>{k}</b> step{k === 1 ? "" : "s"} past the last word, with nothing coming in, the
            state is still moving and the verdict reads{" "}
            <b>
              {dark.ps[step]! >= 0.5 ? `${Math.round(dark.ps[step]! * 100)}% good` : `${Math.round((1 - dark.ps[step]!) * 100)}% bad`}
            </b>
            {settled ? (
              <>
                {" "}
                — and has stopped changing. Left alone, this loop settles into a resting state and
                stays there.
              </>
            ) : (
              <> — still drifting.</>
            )}{" "}
            Every strip in the dark is the same trained network as above, stepped with a word of
            all zeros.
          </>
        )}
      </p>
      <div className="rn-dream">
        <p className="tf-p">
          <b>Hold on to this loop.</b> Later in this series we reach sleep. A mouse that has spent
          the day running a maze replays the run that night: the same cells that fired along the
          path fire again in the same order, faster, sometimes backwards, with no maze under its
          feet and no eyes open. That is a loop turning with the lights off — states producing
          states with nothing coming in — and the reason to build a recurrent network by hand
          before moving on to attention is that this is the picture we will need for dreams. The
          resting state this tame little network falls into is the least interesting thing such a
          loop can do; a brain's does a great deal more, and so, trained differently, does this
          one.
        </p>
      </div>
    </>
  );
}
