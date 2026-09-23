// Panel 3: a language model writes one token at a time. The same slot as the
// Markov chain, but the current state is the whole text so far, and the list
// of odds comes out of a network rather than a table of counts.

import { Link } from "react-router-dom";
import { Card } from "../../components/index.js";
import { NextWordReel, pct, WalkControls } from "./NextWordReel.js";
import { PipelineFigure } from "./PipelineFigure.js";
import { LLM_START, LLM_STEPS, VOCAB } from "./tokens.js";
import { useWalk } from "./walk.js";

const STEPS = LLM_STEPS.map((s) => ({
  probs: s.options.map((o) => o.p),
  pick: s.pick,
}));

export function GeneratePanel() {
  const walk = useWalk(STEPS);
  const tokens = [
    ...LLM_START,
    ...LLM_STEPS.slice(0, walk.taken).map((s) => s.options[s.pick]!.token),
  ];
  const live =
    walk.phase === "options" ||
    walk.phase === "rolling" ||
    walk.phase === "landed";
  const step = live ? LLM_STEPS[walk.taken]! : null;
  const rest = step ? 1 - step.options.reduce((a, o) => a + o.p, 0) : 0;
  const drawn =
    walk.phase === "landed" && step ? step.options[step.pick]!.token : null;

  return (
    <Card className="lm-panel" padding="md">
      <h2 className="lm-h2">An inefficient operation</h2>
      <p className="lm-sub">
        The LLM builds its output word by word, forgetting its context each time
        (caching isn't memory in the human sense). The only two differences from
        the example at the top is that the current state can be longer, up to 1M
        tokens, and we can't store every sequence of words without taking up
        more information than there are atoms in the observable universe.
        Instead, we must approximate the solution using a model-- a neural
        network-- specifically, a large language model.
        <br />
        <br />
        The steps are simple, particularly if you understand{" "}
        <Link to="/examples/mnist-mlp">
          fully connected neural networks
        </Link>{" "}
        and <Link to="/examples/attention">attention</Link>.
      </p>

      <PipelineFigure
        tokens={tokens}
        probs={step ? step.options.map((o) => o.p) : null}
        drawn={drawn}
        ran={live}
      />

      <NextWordReel
        words={tokens.map((t) => t.text)}
        stateSize={walk.phase === "done" ? 0 : tokens.length}
        stateLabel={`current state: all ${tokens.length} tokens`}
        options={
          step
            ? step.options.map((o) => ({
                label: o.token.text.trim() || o.token.text,
                p: o.p,
                sub: String(o.token.id),
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
            startTitle="Run the model"
          />
        }
        footer={
          step
            ? `The other ${(VOCAB - step.options.length).toLocaleString()} tokens share ${pct(rest)}.`
            : undefined
        }
      />
    </Card>
  );
}
