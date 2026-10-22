// Panel 2: fit one day's traffic, and check the fit against the next day.
//
// Each dot is the cars an hour passing one spot on a road, counted every half
// hour. Every day has the same rush hours and different scatter around them.
// The model is fitted to today's counts (filled) and scored on the next day's
// (hollow), taken at the same times. Below the plot, both misses are drawn
// against the parameter count, so the whole sweep is visible at once.
//
// "Next day" moves the calendar on: the next day's counts become today's and
// a new next day arrives. The fits to the last few days stay on the plot,
// faint, refitted at whatever size the slider is at — so the reader sees small
// models agree from day to day and large ones chase each day's scatter.
//
// The panel is titled "Overfitting" and says nothing more about it: today's
// miss falls to zero while the next day's stops falling and creeps back up.
// It names the two halves, though: today's counts are the training data, the
// next day's the test data, the words the panels below build on.

import { useMemo, useState } from "react";
import { Button, Switch } from "../../components/index.js";
import { COUNTS, dayOf, fitAll, maxSizeFor, minSize, modelOf, paramsOf, rms, type Fitted, type Kind } from "./fit.js";
import { ParamSlider, fitPath, sizeFor } from "./draw.js";
import { LegendMark, SplitFigure, px, py } from "./SplitFigure.js";

/** The day the page opens on. See NoisePanel. */
const FIRST_DAY = 11;
/** How many earlier days leave a faint fit behind. */
const GHOSTS = 4;


// Fits are exact and deterministic; keep them so the calendar can go back and
// forth, and ghost days are not refitted on every render.
const FITS = new Map<string, Fitted[]>();
function fitsFor(kind: Kind, day: number): Fitted[] {
  const key = `${kind}:${day}`;
  let f = FITS.get(key);
  if (!f) {
    f = fitAll(kind, dayOf(day), maxSizeFor(kind, COUNTS));
    FITS.set(key, f);
  }
  return f;
}

export function NoisePanel({ kind }: { kind: Kind }) {
  // Any day shows the gap between the two misses; this one also shows the
  // next day's turning back up clearly, for both kinds, so the page opens on it.
  const [day, setDay] = useState(FIRST_DAY);
  const [params, setParams] = useState(4);
  const [usual, setUsual] = useState(false);
  const maxSize = maxSizeFor(kind, COUNTS);
  const size = sizeFor(kind, params, maxSize);
  const at = size - minSize(kind);

  const today = useMemo(() => dayOf(day), [day]);
  const next = useMemo(() => dayOf(day + 1), [day]);
  const fits = fitsFor(kind, day);
  const fit = fits[at]!;

  // Both misses at every size: the curves under the plot.
  const curves = useMemo(
    () => ({
      today: fits.map((f) => rms(f, today)),
      next: fits.map((f) => rms(f, next)),
    }),
    [fits, today, next],
  );

  const ghosts = useMemo(() => {
    const out: string[] = [];
    for (let d = Math.max(FIRST_DAY, day - GHOSTS); d < day; d++) out.push(fitPath(fitsFor(kind, d)[at]!, 0, 24, px, py));
    return out;
  }, [kind, day, at]);

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
            <span className="cs-score__name">training · today</span>
            <span className="cs-score__val">{curves.today[at]!.toFixed(0)}</span>
          </div>
          <div className="cs-score">
            <span className="cs-score__name">test · the next day</span>
            <span className="cs-score__val cs-score__val--next">{curves.next[at]!.toFixed(0)}</span>
          </div>
        </div>

        <div className="cs-box cs-box--controls">
          <Button size="sm" variant="subtle" onClick={() => setDay((d) => d + 1)}>
            Next day
          </Button>
          <Switch label="Usual traffic" checked={usual} onChange={(e) => setUsual(e.target.checked)} />
        </div>

        <div className="cs-legend">
          <LegendMark role="train">training data: today's counts, fitted</LegendMark>
          <LegendMark role="test">test data: the next day's counts</LegendMark>
          <span className="cs-legend__row">
            <svg width="22" height="10" aria-hidden="true">
              <line className="cs-fit" x1="3" y1="5" x2="19" y2="5" />
            </svg>
            the model
          </span>
          {ghosts.length > 0 && (
            <span className="cs-legend__row">
              <svg width="22" height="10" aria-hidden="true">
                <line className="cs-fit cs-fit--ghost" x1="3" y1="5" x2="19" y2="5" />
              </svg>
              fitted to earlier days
            </span>
          )}
          {usual && (
            <span className="cs-legend__row">
              <svg width="22" height="10" aria-hidden="true">
                <line className="cs-usual" x1="3" y1="5" x2="19" y2="5" />
              </svg>
              the usual traffic
            </span>
          )}
        </div>
      </aside>

      <SplitFigure
        points={[
          ...today.map((pt) => ({ pt, role: "train" as const })),
          ...next.map((pt) => ({ pt, role: "test" as const })),
        ]}
        fitD={fitPath(fit, 0, 24, px, py)}
        ghosts={ghosts}
        usual={usual}
        curves={[
          { role: "train", vals: curves.today, label: "training" },
          { role: "test", vals: curves.next, label: "test" },
        ]}
        paramsAt={(i) => paramsOf(kind, i + minSize(kind))}
        at={at}
        onAt={(i) => setParams(paramsOf(kind, i + minSize(kind)))}
        ariaLabel={`Traffic counts through one day, a model with ${paramsOf(kind, size)} parameters fitted to them, and the counts from the next day. Below, the average miss on each day against the number of parameters.`}
      />
    </div>
  );
}
