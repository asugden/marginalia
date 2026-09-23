// Panel 1: a Markov chain of words. The current state is the last word (or
// the last two); the next word is drawn from the words that followed that
// state in the training text, in proportion to how often each did.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card } from "../../components/index.js";
import { CHAINS } from "./markov.js";
import { NextWordReel, WalkControls } from "./NextWordReel.js";
import { useWalk } from "./walk.js";

export function MarkovPanel() {
  const [order, setOrder] = useState<1 | 2>(1);
  const [sample, setSample] = useState(0);
  const chain = CHAINS[order];

  const steps = useMemo(
    () =>
      chain.steps.map((s) => {
        const total = s.options.reduce((a, o) => a + o.count, 0);
        return {
          probs: s.options.map((o) => o.count / total),
          pick: s.pick,
          options: s.options,
        };
      }),
    [chain],
  );
  const walk = useWalk(steps);

  const words = [
    ...chain.start,
    ...chain.steps.slice(0, walk.taken).map((s) => s.options[s.pick]!.word),
  ];
  const current =
    walk.phase === "options" ||
    walk.phase === "rolling" ||
    walk.phase === "landed"
      ? steps[walk.taken]
      : null;
  const spaced = words.map((w, i) => (i === 0 ? w : ` ${w}`));

  const choose = (o: 1 | 2) => {
    setOrder(o);
    setSample(0);
    walk.reset();
  };

  return (
    <Card className="lm-panel" padding="md">
      <h2 className="lm-h2">A Markov chain of words</h2>
      <p className="lm-sub">
        The most important concept is that there is not a "memory" in an LLM.
        Instead, it checks the current state (e.g. a partially finished answer),
        predicts the next most likely words, and chooses randomly amongst them
        based on their probabilities. See{" "}
        <Link to="/examples/softmax">temperature in softmax</Link> to understand
        the probabilities better.
        <br />
        <br />
        Let's consider a simple answer in which the context window is only 1 or
        2 words. See how well the model performs.
      </p>

      <div className="lm-controls">
        <div className="lm-controls__row">
          <span className="lm-controls__label">Current state</span>
          <div className="lm-controls__buttons">
            {([1, 2] as const).map((o) => (
              <Button
                key={o}
                size="sm"
                variant={o === order ? "primary" : "subtle"}
                onClick={() => choose(o)}
              >
                {o === 1 ? "1 word" : "2 words"}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <NextWordReel
        words={spaced}
        stateSize={walk.phase === "done" ? 0 : order}
        stateLabel="current state"
        options={
          current
            ? current.options.map((o, i) => ({
                label: o.word,
                p: current.probs[i]!,
              }))
            : null
        }
        onLine={walk.onLine}
        landed={walk.phase === "landed"}
        controls={
          <WalkControls
            phase={walk.phase}
            onAdvance={walk.advance}
            onReset={walk.reset}
          />
        }
      />

      <div className="lm-box lm-sample">
        <div className="lm-sample__head">
          <span className="lm-kicker">
            Example text · {order === 1 ? "1-word" : "2-word"} state
          </span>
          <Button
            size="sm"
            variant="subtle"
            onClick={() => setSample((s) => (s + 1) % chain.samples.length)}
          >
            Another example
          </Button>
        </div>
        <p className="lm-sample__text">{chain.samples[sample]}</p>
      </div>
    </Card>
  );
}
