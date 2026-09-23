// The recurrent networks example (/examples/rnn).
//
// The arc:
//
//   1. Pac-Man. A sentence is a corridor of pellets; a recurrent network is
//      someone who eats them one at a time and can carry only what is inside
//      him. The strip above his head after each word is the whole memory.
//   2. What is inside him: one small dense layer, used once per word, its
//      state handed to the next copy of itself. Rolled up it is a loop;
//      unrolled it is a deep network as deep as the sentence.
//   3. Give him a notebook: the LSTM. A second thing carried, with gates that
//      decide line by line what to keep. Then the classic experiment — train
//      both on far-away negations and watch only one of them learn.
//   4. Why: a calculator. × 0.5 twenty times is nothing; the training signal
//      walking back through the chain is multiplied at every step, and the
//      factors are measured here on the real networks. The LSTM's notebook
//      path has a multiplier the network can set to 1.
//   5. Lights off. The sentence ends, the loop keeps turning — a forward
//      reference to dreams.
//
// Every state, gate, verdict and factor on the page is computed live from
// ./weights.json via ./rnn.ts. The sentences the models were trained on are
// synthetic, and the page says so. See ./README.md.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/figure.css";
import "../attention/attention.css";
import "../transformers/transformers.css";
import "./rnn.css";
import { Corridor, Meter, VStrip } from "./Corridor.js";
import { DreamPanel } from "./DreamPanel.js";
import { GradientPanel } from "./GradientPanel.js";
import { InsidePanel } from "./InsidePanel.js";
import { LstmPanel } from "./LstmPanel.js";
import { idsOf, loadModels, maxAbs, runPlain, tokenize, type Models, type RawWeights } from "./rnn.js";

const WEIGHTS_URL = "/examples/rnn/weights.json";

const PRESETS = [
  "the film was good",
  "the film was not good",
  "the film was not in the end all that good",
  "the hotel was never by any measure bad",
  "the concert was not if i am honest as it turned out in my view good",
];

export function RnnPage() {
  const [models, setModels] = useState<Models | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState(PRESETS[2]!);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(WEIGHTS_URL, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`weights ${r.status}`);
        return r.json();
      })
      .then((raw: RawWeights) => setModels(loadModels(raw)))
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoadError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  const tokens = useMemo(() => tokenize(text), [text]);
  const ids = useMemo(() => (models ? idsOf(models, tokens) : []), [models, tokens]);
  const unknown = useMemo(() => new Set(ids.map((id, k) => (id < 0 ? k : -1)).filter((k) => k >= 0)), [ids]);
  const runnable = !!models && tokens.length > 0 && unknown.size === 0;
  const run = useMemo(() => (models && runnable ? runPlain(models.plain, ids) : null), [models, runnable, ids]);

  // Start each new sentence with the first word eaten, so there is something
  // above his head from the outset.
  useEffect(() => setStep(Math.min(1, tokens.length)), [text, tokens.length]);

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link to="/examples" className="app-lockup-link" aria-label="Examples">
            <Wordmark size="sm" />
          </Link>
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="mnist-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Recurrent Neural Networks</h1>
            <p className="mnist-lede">
              Every network so far has been handed its whole input at once: a picture, a word.
              A sentence arrives one word at a time, and it can be any length. The recurrent
              network's answer is to read it the way you do — left to right, carrying what it
              has read so far in a single vector, and nothing else. This page builds that
              network, opens it up, gives it a notebook, and finds out on a calculator why the
              plain version forgets.
            </p>
          </div>

          {loadError && <p className="mnist-error">Couldn't load the weights ({loadError}).</p>}
          {!models && !loadError && <div className="mnist-loading">Loading…</div>}

          {models && (
            <>
              <Card className="at-panel" padding="md" id="rn-pacman">
                <h2 className="at-h2">One word at a time</h2>
                <p className="at-sub">
                  Meet the network. The sentence is a corridor of pellets, and he eats them in
                  order. He cannot see behind him: a word, once eaten, is gone. All he has is
                  what is <i>in</i> him — {models.H} numbers, redrawn above his head after every
                  word — and at the end of the corridor he is asked one question: was the review
                  good? The meter under each strip is that question asked early.
                </p>
                <SentencePicker models={models} text={text} onText={setText} unknown={unknown} tokens={tokens} />
                <CorridorPanel models={models} tokens={tokens} unknown={unknown} run={run} step={step} onStep={setStep} />
              </Card>

              {run && (
                <Card className="at-panel" padding="md" id="rn-inside">
                  <h2 className="at-h2">What is inside him</h2>
                  <p className="at-sub">
                    One small <Link to="/examples/deep-neural-network">fully connected layer</Link>. It takes
                    two things — the word he is eating, as its{" "}
                    <Link to="/examples/word2vec">embedding</Link>, and what he was carrying —
                    multiplies each by a matrix, adds, squashes with tanh, and what comes out is
                    what he carries next. The same layer, with the same weights, every word.
                    Drawn with a loop it is one box; drawn out it is a chain, and the chain is as
                    long as the sentence.
                  </p>
                  <InsidePanel models={models} run={run} tokens={tokens} />
                </Card>
              )}

              <Card className="at-panel" padding="md" id="rn-lstm">
                <h2 className="at-h2">Give him a notebook: the LSTM</h2>
                <p className="at-sub">
                  A plain network rewrites its whole state at every word — everything it carries
                  goes through the matrix and the squash again. A <b>long short-term memory</b>{" "}
                  network carries a second thing: a notebook that is <i>not</i> rewritten unless
                  the network chooses to. Three gates, each a dial from 0 to 1 per notebook line,
                  decide how much of the notebook to <b>keep</b>, how much of the new word to{" "}
                  <b>write</b> in, and how much of it to <b>say</b> out loud. Same sentence, same
                  corridor, one more strip above his head.
                </p>
                <LstmPanel models={models} tokens={tokens} ids={ids} step={step} onStep={setStep} runnable={runnable} />
              </Card>

              {run && (
                <Card className="at-panel" padding="md" id="rn-gradient">
                  <h2 className="at-h2">Why the plain one forgets: a calculator</h2>
                  <p className="at-sub">
                    Take any calculator. Type 1. Now press <b>× 0.1</b> and keep pressing it.
                  </p>
                  <GradientPanel models={models} ids={ids} tokens={tokens} />
                </Card>
              )}

              {run && (
                <Card className="at-panel" padding="md" id="rn-dream">
                  <h2 className="at-h2">Lights off</h2>
                  <p className="at-sub">
                    One last thing about a loop: it does not need input to turn. The sentence
                    ends. Keep walking.
                  </p>
                  <DreamPanel models={models} run={run} tokens={tokens} />
                </Card>
              )}
            </>
          )}

          <footer className="mnist-foot">
            <p>
              Two tiny networks — a plain recurrent network and an LSTM, {models?.H ?? 12} numbers
              of state each — trained offline on synthetic review sentences over a{" "}
              {models?.vocab.length ?? 63}-word vocabulary, twice each: once with negations near
              the adjective, once only far from it. Every state, gate, verdict and multiplier on
              the page is computed live in your browser from those weights. The sentences are
              synthetic and the vocabulary is small; the mechanism — one state carried, one layer
              reused, one multiplier per step on the way back — is exact.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

/* ── the sentence ─────────────────────────────────────────────────── */

function SentencePicker({
  models,
  text,
  onText,
  unknown,
  tokens,
}: {
  models: Models;
  text: string;
  onText: (t: string) => void;
  unknown: Set<number>;
  tokens: string[];
}) {
  const [showVocab, setShowVocab] = useState(false);
  return (
    <div className="rn-sentence">
      <div className="at-sentences">
        {PRESETS.map((s) => (
          <Button key={s} size="sm" variant={s === text ? "primary" : "subtle"} onClick={() => onText(s)}>
            {s.length > 34 ? `${s.slice(0, 32)}…` : s}
          </Button>
        ))}
      </div>
      <div className="rn-sentence__own">
        <input
          className="rn-input"
          type="text"
          value={text}
          onChange={(e) => onText(e.target.value)}
          aria-label="Your own sentence, from the words the network knows"
          spellCheck={false}
        />
        <button type="button" className="rn-vocab__toggle" onClick={() => setShowVocab((v) => !v)}>
          {showVocab ? "hide" : "show"} the {models.vocab.length} words it knows
        </button>
      </div>
      {unknown.size > 0 && (
        <p className="rn-warn">
          Not in its vocabulary:{" "}
          {[...unknown].map((k) => (
            <b key={k}>{tokens[k]} </b>
          ))}
          — the network has never seen {unknown.size === 1 ? "that word" : "those words"}, so it
          cannot read this sentence. Swap them for words it knows.
        </p>
      )}
      {showVocab && (
        <div className="rn-vocab">
          {(
            [
              ["things", models.words.subjects.flat()],
              ["verbs", models.words.verbs],
              ["negations", models.words.negations],
              ["intensifiers", models.words.intensifiers],
              ["filler", models.fillers.flat()],
              ["good", models.words.positive],
              ["bad", models.words.negative],
            ] as const
          ).map(([label, ws]) => (
            <div key={label} className="rn-vocab__group">
              <span className="fig-label">{label}</span>
              {[...new Set(ws)].map((w) => (
                <button key={w} type="button" className="rn-vocab__word" onClick={() => onText(`${text.trim()} ${w}`.trim())}>
                  {w}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 1. the corridor ──────────────────────────────────────────────── */

function CorridorPanel({
  models,
  tokens,
  unknown,
  run,
  step,
  onStep,
}: {
  models: Models;
  tokens: string[];
  unknown: Set<number>;
  run: ReturnType<typeof runPlain> | null;
  step: number;
  onStep: (t: number) => void;
}) {
  const T = tokens.length;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (step >= T) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => onStep(step + 1), 520);
    return () => window.clearTimeout(id);
  }, [playing, step, T, onStep]);

  const bound = run ? maxAbs(run.hs) : 1;
  const p = run ? run.ps[Math.min(step, T)]! : 0.5;
  // Where the verdict last flipped sign, for the readout.
  const flip = useMemo(() => {
    if (!run) return -1;
    for (let t = Math.min(step, T); t >= 2; t--) {
      if (run.ps[t]! >= 0.5 !== run.ps[t - 1]! >= 0.5) return t;
    }
    return -1;
  }, [run, step, T]);

  return (
    <>
      <div className="rn-controls">
        <Button size="sm" variant="subtle" onClick={() => { setPlaying(false); onStep(0); }} disabled={step === 0}>
          start over
        </Button>
        <Button size="sm" variant={playing ? "subtle" : "primary"} onClick={() => setPlaying((v) => !v)} disabled={!run || (!playing && step >= T)}>
          {playing ? "pause" : step >= T ? "eaten" : "eat"}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => onStep(Math.min(T, step + 1))} disabled={!run || step >= T}>
          one word
        </Button>
        <span className="rn-controls__hint">or click a word</span>
      </div>
      <div className="tf-figwrap">
        <Corridor
          tokens={tokens}
          step={Math.min(step, T)}
          onStep={(t) => { setPlaying(false); onStep(t); }}
          unknown={unknown}
          aboveH={run ? 96 : 0}
          labels={run ? [{ y: 30, text: "what he carries" }, { y: 90, text: "verdict" }] : undefined}
          above={
            run
              ? (t, x) =>
                  t === 0 ? (
                    <rect className="rn-empty" x={x - 5} y={4} width={10} height={59} rx={2} />
                  ) : (
                    <>
                      <VStrip v={run.hs[t]!} bound={bound} x={x} y={4} />
                      <Meter p={run.ps[t]!} x={x} y={72} />
                    </>
                  )
              : undefined
          }
          ariaLabel={`A corridor of ${T} words eaten left to right; above each eaten word, the ${models.H}-number state and the verdict so far.`}
        />
      </div>
      {run && (
        <p className="tf-readout">
          {step === 0 ? (
            <>He has eaten nothing and carries nothing: the strip is empty and the meter sits at the middle. Press <b>eat</b>.</>
          ) : (
            <>
              After <b>{tokens[step - 1]}</b> he carries the strip above his head and would say{" "}
              <b>{p >= 0.5 ? `${Math.round(p * 100)}% good` : `${Math.round((1 - p) * 100)}% bad`}</b>.
              {flip > 0 && (
                <>
                  {" "}
                  The verdict last flipped at <b>{tokens[flip - 1]}</b>
                  {flip < step ? (
                    <>
                      , and has held through{" "}
                      <i>{tokens.slice(flip, step).join(" ")}</i> — every one of those words went
                      through him, and the flag survived
                    </>
                  ) : null}
                  .
                </>
              )}{" "}
              Nothing here looks back at the sentence: the strip after <b>{tokens[step - 1]}</b>{" "}
              was made from that word and the strip before it, and from nothing else.
              {step === T && (
                <>
                  {" "}
                  Compare the <Link to="/examples/attention">attention</Link> grid, where every word
                  can see every other at once: this network has to have <i>remembered</i>.
                </>
              )}
            </>
          )}
        </p>
      )}
    </>
  );
}
