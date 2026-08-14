// The CNN digit-recognizer example page (/examples/cnn-digit-recognizer).
//
// Sibling of the MLP example: same input grid, same chrome, same live-inference
// plumbing — but the model is a small convolutional network, and the
// visualization shows kernels, feature maps, and pooling. Clicking a conv-1
// kernel arms a 3x3 "scan" over the input grid that shows the convolution
// arithmetic (the key teaching moment).
//
// Fully static + unauthenticated: loads cnn-weights.json and runs entirely in
// the browser.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "./cnn.css";
import {
  forwardCNN,
  loadCNN,
  predictCNN,
  type CNNActivations,
  type CNNNet,
  type CNNRawWeights,
} from "./cnn-net.js";
import { CNNNetworkView } from "./CNNNetworkView.js";

const WEIGHTS_URL = "/examples/cnn-digit-recognizer/cnn-weights.json";

export function CNNDigitRecognizerPage() {
  const [net, setNet] = useState<CNNNet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activations, setActivations] = useState<CNNActivations | null>(null);
  const [clearSignal, setClearSignal] = useState(0);
  const [scanKernel, setScanKernel] = useState<number | null>(null);
  const [showWiring, setShowWiring] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(WEIGHTS_URL, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(`weights ${r.status}`); return r.json(); })
      .then((raw: CNNRawWeights) => setNet(loadCNN(raw)))
      .catch((e) => { if (!ctrl.signal.aborted) setLoadError(e.message); });
    return () => ctrl.abort();
  }, []);

  // Coalesced inference (rAF + setTimeout fallback), reading net through a ref.
  const netRef = useRef<CNNNet | null>(net);
  netRef.current = net;
  const pending = useRef<Float32Array | null>(null);
  const scheduled = useRef(false);
  const runPending = useCallback(() => {
    scheduled.current = false;
    const n = netRef.current;
    if (!n || !pending.current) return;
    setActivations(forwardCNN(n, pending.current));
    pending.current = null;
  }, []);
  const handleDraw = useCallback((input: Float32Array) => {
    pending.current = input;
    if (scheduled.current) return;
    scheduled.current = true;
    const run = () => runPending();
    requestAnimationFrame(run);
    setTimeout(run, 32);
  }, [runPending]);

  const predicted = activations ? predictCNN(activations) : -1;
  const anyInk = useMemo(
    () => (activations ? activations.raw.some((v) => v > 0.02) : false),
    [activations],
  );
  const ranking = useMemo(() => {
    if (!net || !activations) return [];
    return Array.from(activations.output)
      .map((p, i) => ({ label: net.labels[i], p, i }))
      .sort((a, b) => b.p - a.p);
  }, [net, activations]);

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
            <h1>Digit recognizer — convolutional</h1>
            <p className="mnist-lede">
              The same drawing, read by a <b>convolutional</b> neural network.
              Instead of connecting every pixel to every neuron, a CNN slides
              small 3×3 <b>kernels</b> across the image to detect little
              patterns — edges, corners, strokes. Each kernel produces a{" "}
              <b>feature map</b>; pooling shrinks it; a second convolution builds
              on the first; then a dense layer makes the call.{" "}
              <b>Click any kernel</b> in the “conv 1” row to see exactly how its
              3×3 window multiplies the pixels underneath it.
            </p>
          </div>

          {loadError && (
            <p className="mnist-error">Couldn’t load the network ({loadError}).</p>
          )}

          <div className="mnist-layout">
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

              <div className="cnn-scanbox">
                <p className="cnn-scanbox__title">Kernel scan</p>
                {scanKernel == null ? (
                  <p className="cnn-scanbox__hint">
                    Click a kernel in the <b>conv 1</b> row, then move over the
                    input grid to see the 3×3 convolution arithmetic.
                  </p>
                ) : (
                  <>
                    <p className="cnn-scanbox__hint">
                      Scanning <b>kernel {scanKernel}</b>. Move over the input
                      grid; the panel shows pixel × weight for the nine cells.
                    </p>
                    <button type="button" className="mnist-clear" onClick={() => setScanKernel(null)}>
                      Stop scanning
                    </button>
                  </>
                )}
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
                  feature-map value: low → high
                </div>
              </div>
            </aside>

            <div className="mnist-canvas">
              <div className="mnist-canvas__bar">
                <span className="mnist-canvas__hint">
                  {scanKernel == null ? "Draw on the input grid ↓" : "Scan mode — move over the grid"}
                </span>
                <button
                  type="button"
                  className={"mnist-clear" + (showWiring ? " mnist-clear--on" : "")}
                  onClick={() => setShowWiring((v) => !v)}
                  title="Show how the layers are wired together (representative flow)"
                >
                  {showWiring ? "Hide wiring" : "Show wiring"}
                </button>
                <button
                  type="button"
                  className="mnist-clear"
                  onClick={() => {
                    setClearSignal((n) => n + 1);
                    setScanKernel(null); // clearing also exits scan mode
                  }}
                >
                  Clear
                </button>
              </div>
              {net ? (
                <CNNNetworkView
                  net={net}
                  activations={activations}
                  predicted={predicted}
                  onInput={handleDraw}
                  clearSignal={clearSignal}
                  scanKernel={scanKernel}
                  onPickKernel={setScanKernel}
                  showWiring={showWiring}
                />
              ) : (
                !loadError && <div className="mnist-loading">Loading network…</div>
              )}
            </div>
          </div>

          <footer className="mnist-foot">
            <p>
              This is a small convolutional network: two convolution layers of
              eight 3×3 kernels each (with 2×2 max-pooling after each), then one
              dense hidden layer of 24 neurons, then the output. It reaches about
              98% on handwritten digits. A few of the eight first-layer kernels
              settle into recognizable edge detectors — click through them and
              watch which parts of a stroke each one lights up.{" "}
              <b>Hover any feature-map cell</b> to see the little patch it was
              computed from in the layer above (a 3×3 for convolutions, a 2×2 for
              pooling) — for a conv-2 cell that patch is a 3×3 across{" "}
              <i>all eight</i> pool-1 maps at once, which is why the box lights up
              on every one. The lines at the bottom are the real, fully-connected
              weights from the flattened maps through the dense layer to the
              output. Each conv-2 filter is really a 3×3×8 stack (one 3×3 per
              incoming channel); the row swatch shows their average, but{" "}
              <b>click a conv-2 kernel</b> to see all eight slices. Toggle{" "}
              <b>Show wiring</b> for a simplified flow diagram: the input feeds
              each conv-1 map, pooling keeps the channel, then conv 2 pulls from{" "}
              <i>all</i> conv-1 channels at once (the fan-in) before its own
              pooling.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
