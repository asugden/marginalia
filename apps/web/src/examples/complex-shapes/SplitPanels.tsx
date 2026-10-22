// Panels 3 and 4: making a test set out of the data you have, and choosing a
// model without spending it.
//
//   HoldOutPanel     One day's counts. A quarter or half are set aside at
//                    random; the model only sees the rest. Training and test
//                    miss against parameters, as in the panel above.
//   ValidationPanel  The same day split three ways. The size with the lowest
//                    validation miss is marked as chosen, and its test miss is
//                    reported beside its validation miss. A tally over many
//                    shuffles shows which way the gap usually falls.
//
// Both draw with SplitFigure, so the marks mean what they meant above.

import { useMemo, useState } from "react";
import { Button } from "../../components/index.js";
import { ParamSlider, fitPath, sizeFor } from "./draw.js";
import { COUNTS, dayOf, minSize, modelOf, paramsOf, type Kind } from "./fit.js";
import { LegendMark, SplitFigure, px, py } from "./SplitFigure.js";
import { SPLIT_DAY, argmin, fitAndScore, splitInto, tally } from "./split.js";

const SHARES: Array<[number, string]> = [
  [0.25, "A quarter"],
  [0.5, "Half"],
];

export function HoldOutPanel({ kind }: { kind: Kind }) {
  const [share, setShare] = useState(0.25);
  const [seed, setSeed] = useState(1);
  const [params, setParams] = useState(4);
  const day = useMemo(() => dayOf(SPLIT_DAY), []);
  const nTest = Math.round(COUNTS * share);
  const [test, train] = useMemo(() => splitInto(day, [nTest, COUNTS - nTest], seed), [day, nTest, seed]);
  const r = useMemo(() => fitAndScore(kind, train!, [test!]), [kind, train, test]);
  const maxSize = r.fits.length - 1 + minSize(kind);
  const size = sizeFor(kind, params, maxSize);
  const at = size - minSize(kind);

  return (
    <div className="cs-layout">
      <aside className="cs-side">
        <div className="cs-box cs-box--controls">
          <ParamSlider kind={kind} size={size} maxSize={maxSize} onSize={(s) => setParams(paramsOf(kind, s))} />
          <span className="cs-model">{modelOf(kind, size)}</span>
        </div>

        <div className="cs-box" aria-live="polite">
          <span className="cs-kicker">Average miss, cars an hour</span>
          <div className="cs-score">
            <span className="cs-score__name">training · {train!.length} counts</span>
            <span className="cs-score__val">{r.train[at]!.toFixed(0)}</span>
          </div>
          <div className="cs-score">
            <span className="cs-score__name">test · {test!.length} counts</span>
            <span className="cs-score__val cs-score__val--next">{r.others[0]![at]!.toFixed(0)}</span>
          </div>
        </div>

        <div className="cs-box cs-box--controls">
          <span className="cs-kicker">Set aside</span>
          <div className="cs-buttons">
            {SHARES.map(([v, label]) => (
              <Button
                key={v}
                size="sm"
                variant={v === share ? "primary" : "subtle"}
                aria-pressed={v === share}
                onClick={() => setShare(v)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="subtle" onClick={() => setSeed((s) => s + 1)}>
            Reshuffle
          </Button>
        </div>

        <div className="cs-legend">
          <LegendMark role="train">training data, fitted</LegendMark>
          <LegendMark role="test">test data, set aside</LegendMark>
        </div>
      </aside>

      <SplitFigure
        points={[
          ...train!.map((pt) => ({ pt, role: "train" as const })),
          ...test!.map((pt) => ({ pt, role: "test" as const })),
        ]}
        fitD={fitPath(r.fits[at]!, 0, 24, px, py)}
        curves={[
          { role: "train", vals: r.train, label: "training" },
          { role: "test", vals: r.others[0]!, label: "test" },
        ]}
        paramsAt={(i) => paramsOf(kind, i + minSize(kind))}
        at={at}
        onAt={(i) => setParams(paramsOf(kind, i + minSize(kind)))}
        ariaLabel={`One day's traffic counts, ${test!.length} of them set aside as test data, and a model with ${paramsOf(kind, size)} parameters fitted to the rest. Below, training and test miss against the number of parameters.`}
      />
    </div>
  );
}

/** Training, validation and test counts out of the day's 48. */
const THREE_WAY = [24, 12, 12];
const SHUFFLES = 100;

export function ValidationPanel({ kind }: { kind: Kind }) {
  const [seed, setSeed] = useState(1);
  const day = useMemo(() => dayOf(SPLIT_DAY), []);
  const [train, val, test] = useMemo(() => splitInto(day, THREE_WAY, seed), [day, seed]);
  const r = useMemo(() => fitAndScore(kind, train!, [val!, test!]), [kind, train, val, test]);
  const chosen = argmin(r.others[0]!);
  // The slider starts on the chosen size, and returns to it on a reshuffle.
  const [picked, setPicked] = useState<number | null>(null);
  // Clamped: switching steps/bends changes how many sizes there are.
  const at = Math.min(picked ?? chosen, r.fits.length - 1);
  const maxSize = r.fits.length - 1 + minSize(kind);
  const size = at + minSize(kind);
  const many = useMemo(() => tally(kind, day, THREE_WAY, SHUFFLES), [kind, day]);

  return (
    <div className="cs-layout">
      <aside className="cs-side">
        <div className="cs-box cs-box--controls">
          <ParamSlider
            kind={kind}
            size={size}
            maxSize={maxSize}
            onSize={(s) => setPicked(sizeFor(kind, paramsOf(kind, s), maxSize) - minSize(kind))}
          />
          <span className="cs-model">{modelOf(kind, size)}</span>
        </div>

        <div className="cs-box" aria-live="polite">
          <span className="cs-kicker">
            Chosen: {paramsOf(kind, chosen + minSize(kind))} parameters, lowest validation miss
          </span>
          <div className="cs-score">
            <span className="cs-score__name">validation</span>
            <span className="cs-score__val">{r.others[0]![chosen]!.toFixed(0)}</span>
          </div>
          <div className="cs-score">
            <span className="cs-score__name">test</span>
            <span className="cs-score__val cs-score__val--next">{r.others[1]![chosen]!.toFixed(0)}</span>
          </div>
        </div>

        <div className="cs-box cs-box--controls">
          <Button
            size="sm"
            variant="subtle"
            onClick={() => {
              setSeed((s) => (s % SHUFFLES) + 1);
              setPicked(null);
            }}
          >
            Reshuffle
          </Button>
          <span className="cs-kicker">
            Shuffle {seed} of {SHUFFLES}
          </span>
        </div>

        <div className="cs-legend">
          <LegendMark role="train">training: {THREE_WAY[0]} counts, fitted</LegendMark>
          <LegendMark role="val">validation: {THREE_WAY[1]}, to choose the size</LegendMark>
          <LegendMark role="test">test: {THREE_WAY[2]}, looked at once</LegendMark>
        </div>
      </aside>

      <div className="cs-figcol">
        <SplitFigure
          points={[
            ...train!.map((pt) => ({ pt, role: "train" as const })),
            ...val!.map((pt) => ({ pt, role: "val" as const })),
            ...test!.map((pt) => ({ pt, role: "test" as const })),
          ]}
          fitD={fitPath(r.fits[at]!, 0, 24, px, py)}
          curves={[
            { role: "train", vals: r.train, label: "training" },
            { role: "val", vals: r.others[0]!, label: "validation" },
            { role: "test", vals: r.others[1]!, label: "test" },
          ]}
          paramsAt={(i) => paramsOf(kind, i + minSize(kind))}
          at={at}
          onAt={setPicked}
          chosen={chosen}
          ariaLabel={`One day's traffic counts split into training, validation and test. Below, all three misses against the number of parameters, with the size that has the lowest validation miss marked as chosen.`}
        />
        <p className="cs-tally">
          Over all {many.shuffles} shuffles, the chosen model's test miss came out higher than its validation miss{" "}
          {many.testWorse} times, by {many.meanGap.toFixed(0)} cars an hour on average.
        </p>
      </div>
    </div>
  );
}
