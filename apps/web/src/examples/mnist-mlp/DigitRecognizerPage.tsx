// The deep-neural-network example page (/examples/deep-neural-network).
//
// Fully static and unauthenticated: it loads the pre-trained weights as a JSON
// asset and runs the whole network in the browser. No course, no /api call, no
// sign-in. Draw a digit; the forward pass runs on every stroke and the
// visualization recolors live.
//
// Layout mirrors the reference (Brilliant's MNIST demo) but inverted the way
// the platform draws networks: input at the top, output at the bottom.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Wordmark } from "../../components/index.js";
import "./digit-recognizer.css";
import {
  forward,
  loadNet,
  predict,
  type Activations,
  type Net,
  type RawWeights,
} from "./net.js";
import { NetworkView, REGION_SPAN, type Region } from "./NetworkView.js";
import { MLP_CODE } from "./code.js";
import { CodeToggle } from "../shared/code-panel/CodeToggle.js";
import { CodePopover, regionsLitBy } from "../shared/code-panel/CodePopover.js";
import type { CodeSection } from "../shared/code-panel/types.js";
import { useCodeView } from "../shared/code-panel/useCodeView.js";
import "../shared/code-panel/code-panel.css";

// The weights ship in /public so they're served as a plain static asset by the
// same host as the SPA. Fetched once on mount.
const WEIGHTS_URL = "/examples/deep-neural-network/weights.json";

export function DigitRecognizerPage() {
  const [net, setNet] = useState<Net | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activations, setActivations] = useState<Activations | null>(null);
  const [edgeThreshold, setEdgeThreshold] = useState(0.55);
  const [clearSignal, setClearSignal] = useState(0);

  // Optional code view (off by default). The code itself lives in ./code.ts.
  const code = useCodeView("deep-neural-network", MLP_CODE);
  // The open code popover: the boxes for one part of the figure (or one
  // stand-alone box), and which of them is showing. `key` names the button
  // that opened it. Hovering a button opens its popover, which stays up
  // while the pointer is on the button or the popover (with a short grace
  // to cross the gap); clicking pins it until it is closed, which is also
  // how a touch screen opens it.
  const [open, setOpen] = useState<{
    key: string;
    at: Region | null;
    sections: CodeSection[];
    index: number;
    pinned: boolean;
  } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const keepOpen = useCallback(() => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const closeSoon = useCallback(() => {
    keepOpen();
    closeTimer.current = window.setTimeout(() => {
      setOpen((cur) => (cur && !cur.pinned ? null : cur));
    }, 250);
  }, [keepOpen]);
  useEffect(() => keepOpen, [keepOpen]);
  const closeCode = useCallback(() => {
    keepOpen();
    setOpen(null);
  }, [keepOpen]);
  const show = useCallback(
    (key: string, at: Region | null, sections: CodeSection[], pin: boolean) => {
      keepOpen();
      if (!sections.length) return;
      setOpen((cur) => {
        if (cur?.key === key) return pin ? { ...cur, pinned: true } : cur;
        if (cur?.pinned && !pin) return cur; // a pinned box stays put
        return { key, at, sections, index: 0, pinned: pin };
      });
    },
    [keepOpen],
  );
  const sectionsAt = useCallback(
    (r: Region) => code.version.sections.filter((s) => s.over.includes(r)),
    [code.version],
  );
  // While a box is open its part of the network stays lit and the rest dims.
  const litRegions = useMemo(
    () =>
      code.on && open
        ? (regionsLitBy(open.sections[open.index]) as Set<Region> | null)
        : null,
    [code.on, open],
  );
  // Buttons under the figure for boxes that build no single part. Quiet
  // text buttons; hover opens, click pins, like the parts themselves.
  const codeButton = (
    key: string,
    at: Region | null,
    sections: CodeSection[],
    label: string,
    children: ReactNode,
    extra: { className?: string; style?: React.CSSProperties } = {},
  ) => (
    <Button
      key={key}
      size="sm"
      variant="ghost"
      className={[extra.className, open?.key === key ? "is-open" : ""].filter(Boolean).join(" ")}
      style={extra.style}
      title={label}
      aria-label={label}
      aria-pressed={open?.key === key}
      onPointerEnter={() => show(key, at, sections, false)}
      onPointerLeave={closeSoon}
      onClick={() => show(key, at, sections, true)}
    >
      {children}
    </Button>
  );
  // In code view the network's parts are the controls. Each part belongs
  // to one box: the first that builds it. In the Dense version a layer's
  // lines and neurons both open its Dense line, so the layer acts as one
  // part. The popover is keyed and placed by the box's own home part (its
  // neuron row when it has one), so it opens in the same place whichever
  // half of the layer the pointer came in by.
  const homeOf = useCallback(
    (r: Region): Region | null => {
      const owner = code.version.sections.find((s) => s.over.includes(r));
      if (!owner) return null;
      const over = owner.over as Region[];
      return over.find((x) => !x.startsWith("w")) ?? over[0] ?? null;
    },
    [code.version],
  );
  const showRegion = useCallback(
    (r: Region, pin: boolean) => {
      const home = homeOf(r);
      if (home) show(`r:${home}`, home, sectionsAt(home), pin);
    },
    [homeOf, show, sectionsAt],
  );
  const extras = code.version.sections.filter((s) => s.over.length === 0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(WEIGHTS_URL, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`weights ${r.status}`);
        return r.json();
      })
      .then((raw: RawWeights) => setNet(loadNet(raw)))
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoadError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  // Throttle inference to animation frames so a fast drag doesn't run the
  // forward pass dozens of times between paints. The latest input wins.
  //
  // `net` is read through a ref, not a closure: DrawPad calls `handleDraw` from
  // a stable (identity-fixed) callback, so if `handleDraw` closed over `net`
  // directly it could capture the pre-load `null`. The ref always has the
  // latest loaded net.
  const netRef = useRef<Net | null>(net);
  netRef.current = net;
  const pending = useRef<Float32Array | null>(null);
  const scheduled = useRef(false);
  const runPending = useCallback(() => {
    scheduled.current = false;
    const n = netRef.current;
    if (!n || !pending.current) return;
    setActivations(forward(n, pending.current));
    pending.current = null;
  }, []);

  // Coalesce bursts of stroke events into one forward pass per frame. We prefer
  // requestAnimationFrame (paints in step with the redraw) but always arm a
  // setTimeout fallback: rAF callbacks can be paused for a backgrounded tab,
  // and inference must still run when the tab regains focus / in headless
  // contexts. Whichever fires first clears the flag; the other no-ops.
  const handleDraw = useCallback(
    (input: Float32Array) => {
      pending.current = input;
      if (scheduled.current) return;
      scheduled.current = true;
      const run = () => runPending();
      requestAnimationFrame(run);
      setTimeout(run, 32);
    },
    [runPending],
  );

  const predicted = activations ? predict(activations) : -1;
  const anyInk = useMemo(
    () => (activations ? activations.raw.some((v) => v > 0.02) : false),
    [activations],
  );

  // Top-3 readout (excluding the blank class unless it wins).
  const ranking = useMemo(() => {
    if (!net || !activations) return [];
    return Array.from(activations.output)
      .map((p, i) => ({ label: net.labels[i], p, i }))
      .sort((a, b) => b.p - a.p);
  }, [net, activations]);

  return (
    <div className="app">
      {/* DS topbar, matching the student shell: the red mono wordmark on the
          left with a back link to the gallery. */}
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link
            to="/examples"
            className="app-lockup-link"
            aria-label="Examples"
          >
            <Wordmark size="sm" />
          </Link>
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="mnist-page">
          {/* Left-justified eyebrow -> heading lockup, DS style, with the
              optional code switch at its upper right. */}
          <div className="mnist-head">
            <div className="mnist-head__top">
              <p className="eyebrow">Interactive example</p>
              <CodeToggle
                on={code.on}
                onChange={(on) => {
                  code.setOn(on);
                  closeCode();
                }}
                versions={MLP_CODE}
                versionId={code.version.id}
                onVersion={(id) => {
                  code.setVersion(id);
                  closeCode();
                }}
              />
            </div>
            <h1>Deep Neural Network</h1>
            <p className="mnist-lede">
              Draw a digit on the grid at the top of the network. The top of the
              network is the model's input layer. All of the pixels are values
              between 0 and 1, which then connect to every neuron in Hidden
              layer 1 (a fully connected network). This custom neural network was trained
              on tens of thousands of handwritten digits (MNIST), and predicts
              which digit it is with 97% accuracy. Every entry in Hidden 1 and
              Hidden 2 is a neuron; every line is a connection. Watch the signal
              flow down to a guess at the bottom.
            </p>
          </div>

          {loadError && (
            <p className="mnist-error">
              Couldn't load the network ({loadError}).
            </p>
          )}

          <div className="mnist-layout">
            {/* Left: prediction + controls. Drawing happens on the network's own
            input grid to the right (with the Clear control docked beside it). */}
            <aside className="mnist-controls">
              <div className="mnist-readout" aria-live="polite">
                {!anyInk ? (
                  <p className="mnist-readout__empty">
                    Draw a digit on the grid at the top of the network to see a
                    prediction.
                  </p>
                ) : (
                  <>
                    <div className="mnist-guess">
                      <span className="mnist-guess__label">Best guess</span>
                      <span className="mnist-guess__value">
                        {predicted >= 0 && net ? net.labels[predicted] : "—"}
                      </span>
                    </div>
                    <ul className="mnist-bars">
                      {ranking.slice(0, 4).map((r) => (
                        <li key={r.i}>
                          <span className="mnist-bars__name">{r.label}</span>
                          <span className="mnist-bars__track">
                            <span
                              className="mnist-bars__fill"
                              style={{ width: `${Math.round(r.p * 100)}%` }}
                            />
                          </span>
                          <span className="mnist-bars__pct">
                            {Math.round(r.p * 100)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="mnist-slider">
                <label htmlFor="edge-threshold">
                  Connection detail
                  <span className="mnist-slider__hint">
                    weak links hidden ↔ shown
                  </span>
                </label>
                <input
                  id="edge-threshold"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={edgeThreshold}
                  onChange={(e) => setEdgeThreshold(parseFloat(e.target.value))}
                />
              </div>

              <div className="mnist-legend">
                <div className="mnist-legend__row">
                  <span className="mnist-legend__swatch mnist-legend__swatch--pos" />
                  positive weight
                  <span className="mnist-legend__swatch mnist-legend__swatch--neg" />
                  negative weight
                </div>
                <div className="mnist-legend__row">
                  <span className="mnist-legend__grad" />
                  neuron value: low → high
                </div>
                <div className="mnist-legend__row">
                  <span className="mnist-legend__grad mnist-legend__grad--input" />
                  what you drew: the input itself
                </div>
              </div>
            </aside>

            {/* Right: the network. The Clear control is docked at the top-right,
            beside the input grid it acts on. */}
            <div className="mnist-canvas">
              <div className="mnist-canvas__bar">
                <span className="mnist-canvas__hint">
                  Draw on the input grid ↓
                </span>
                <button
                  type="button"
                  className="mnist-clear"
                  onClick={() => {
                    setClearSignal((n) => n + 1);
                  }}
                >
                  Clear
                </button>
              </div>
              {net ? (
                <div className="mnist-figure">
                <NetworkView
                  net={net}
                  activations={activations}
                  edgeThreshold={edgeThreshold}
                  predicted={predicted}
                  onInput={handleDraw}
                  clearSignal={clearSignal}
                  codeOn={code.on}
                  litRegions={litRegions}
                  onRegionEnter={(r) => showRegion(r, false)}
                  onRegionLeave={closeSoon}
                  onRegionClick={(r) => showRegion(r, true)}
                />
                {code.on && open && (() => {
                  // Beside the part, never on it: below a part in the upper
                  // half, above one in the lower half; on the same side as
                  // its marker. Stand-alone boxes sit at the bottom.
                  const span = open.at ? REGION_SPAN[open.at] : null;
                  const below = span ? span.bottom < 0.5 : false;
                  const side = open.at?.startsWith("w") ? "left" : "right";
                  const style = span
                    ? below
                      ? { top: `${span.bottom * 100}%`, [side]: 8 }
                      : { top: `${span.top * 100}%`, transform: "translateY(-100%)", [side]: 8 }
                    : { bottom: 8, right: 8 };
                  return (
                    <CodePopover
                      sections={open.sections}
                      index={open.index}
                      onIndex={(index) => setOpen({ ...open, index })}
                      onClose={closeCode}
                      style={style}
                      onPointerEnter={keepOpen}
                      onPointerLeave={closeSoon}
                    />
                  );
                })()}
                </div>
              ) : (
                !loadError && (
                  <div className="mnist-loading">Loading network…</div>
                )
              )}
              {code.on && extras.length > 0 && (
                <div className="ex-chips">
                  {extras.map((x) =>
                    codeButton(`s:${x.id}`, null, [x], x.title, x.title),
                  )}
                </div>
              )}
            </div>
          </div>

          <footer className="mnist-foot">
            <p>
              This is a fully connected network (otherwise known as a
              "multilayer perceptron") with two hidden layers of 25 neurons.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
