// The digit-recognizer example page (/examples/digit-recognizer).
//
// Fully static and unauthenticated: it loads the pre-trained weights as a JSON
// asset and runs the whole network in the browser. No course, no /api call, no
// sign-in. Draw a digit; the forward pass runs on every stroke and the
// visualization recolors live.
//
// Layout mirrors the reference (Brilliant's MNIST demo) but inverted the way
// the platform draws networks: input at the top, output at the bottom.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../../components/index.js";
import { loadNet, forward, predict, type Net, type Activations, type RawWeights } from "./net.js";
import { NetworkView } from "./NetworkView.js";
import "./digit-recognizer.css";

// The weights ship in /public so they're served as a plain static asset by the
// same host as the SPA. Fetched once on mount.
const WEIGHTS_URL = "/examples/digit-recognizer/weights.json";

export function DigitRecognizerPage() {
  const [net, setNet] = useState<Net | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activations, setActivations] = useState<Activations | null>(null);
  const [edgeThreshold, setEdgeThreshold] = useState(0.55);
  const [clearSignal, setClearSignal] = useState(0);

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
  const handleDraw = useCallback((input: Float32Array) => {
    pending.current = input;
    if (scheduled.current) return;
    scheduled.current = true;
    const run = () => runPending();
    requestAnimationFrame(run);
    setTimeout(run, 32);
  }, [runPending]);

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
          <Link to="/examples" className="app-lockup-link" aria-label="Examples">
            <Wordmark size="sm" />
          </Link>
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="mnist-page">
          {/* Left-justified eyebrow -> heading lockup, DS style. */}
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Digit recognizer</h1>
            <p className="mnist-lede">
              Draw a digit right onto the grid at the top of the network — that
              grid is the model’s input layer. A small neural network, trained on
              tens of thousands of handwritten digits, reads what you drew and
              guesses which digit it is. Every circle is a neuron; every line is a
              connection. Watch the signal flow down to a guess at the bottom.
            </p>
          </div>

      {loadError && (
        <p className="mnist-error">Couldn’t load the network ({loadError}).</p>
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
                        <span className="mnist-bars__fill" style={{ width: `${Math.round(r.p * 100)}%` }} />
                      </span>
                      <span className="mnist-bars__pct">{Math.round(r.p * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="mnist-slider">
            <label htmlFor="edge-threshold">
              Connection detail
              <span className="mnist-slider__hint">weak links hidden ↔ shown</span>
            </label>
            <input
              id="edge-threshold"
              type="range" min={0} max={1} step={0.01}
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
          </div>
        </aside>

        {/* Right: the network. The Clear control is docked at the top-right,
            beside the input grid it acts on. */}
        <div className="mnist-canvas">
          <div className="mnist-canvas__bar">
            <span className="mnist-canvas__hint">Draw on the input grid ↓</span>
            <button
              type="button"
              className="mnist-clear"
              onClick={() => { setClearSignal((n) => n + 1); }}
            >
              Clear
            </button>
          </div>
          {net ? (
            <NetworkView
              net={net}
              activations={activations}
              edgeThreshold={edgeThreshold}
              predicted={predicted}
              onInput={handleDraw}
              clearSignal={clearSignal}
            />
          ) : (
            !loadError && <div className="mnist-loading">Loading network…</div>
          )}
        </div>
      </div>

          <footer className="mnist-foot">
            <p>
              This is a fully-connected network (a “multilayer perceptron”) with
              two hidden layers of 25 neurons. It classifies about 97% of
              handwritten digits correctly — so it will sometimes be wrong,
              especially on messy or unusual writing. That honesty is the point:
              nothing here is faked, the guess is a live computation from what you
              drew.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
