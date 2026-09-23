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
import { Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/figure.css";
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
import { FaceHierarchy, FaceHierarchyCitation } from "./FaceHierarchy.js";
import { OneByOne } from "./OneByOne.js";
import { PoolingStride } from "./PoolingStride.js";
import { ResNetCitation, ResNetStack } from "./ResNetStack.js";

const WEIGHTS_URL = "/examples/cnn-digit-recognizer/cnn-weights.json";

export function CNNDigitRecognizerPage() {
  const [net, setNet] = useState<CNNNet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activations, setActivations] = useState<CNNActivations | null>(null);
  const [clearSignal, setClearSignal] = useState(0);
  const [scanKernel, setScanKernel] = useState<number | null>(null);
  const [showWiring, setShowWiring] = useState(false);

  // Other pages link straight to a panel (#resnet from counting parameters).
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

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
            <h1>Convolutional Neural Network</h1>
            <p className="mnist-lede">
              The same drawing, read by a <b>convolutional</b> neural network.
              Instead of connecting every pixel to every neuron, a CNN slides
              small 3×3 <b>kernels</b> across the image to detect little
              patterns — edges, corners, strokes. Each kernel produces a{" "}
              <b>feature map</b>; pooling shrinks it; a second convolution builds
              on the first; then a fully connected layer makes the call.{" "}
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

              <div className="mnist-legend">
                <div className="mnist-legend__row">
                  <span className="mnist-legend__swatch mnist-legend__swatch--pos" />
                  positive weight
                  <span className="mnist-legend__swatch mnist-legend__swatch--neg" />
                  negative weight
                </div>
                <div className="mnist-legend__row">
                  <span className="mnist-legend__grad mnist-legend__grad--input" />
                  feature-map value: low → high
                </div>
                <div className="mnist-legend__row">
                  <span className="mnist-legend__grad" />
                  neuron value: low → high
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
              fully connected hidden layer of 24 neurons, then the output. It reaches about
              98% on handwritten digits. A few of the eight first-layer kernels
              settle into recognizable edge detectors — click through them and
              watch which parts of a stroke each one lights up.{" "}
              <b>Hover any feature-map cell</b> to see the little patch it was
              computed from in the layer above (a 3×3 for convolutions, a 2×2 for
              pooling) — for a conv-2 cell that patch is a 3×3 across{" "}
              <i>all eight</i> pool-1 maps at once, which is why the box lights up
              on every one. The lines at the bottom are the real, fully connected
              weights from the flattened maps through the fully connected layer to the
              output. Each conv-2 filter is really a 3×3×8 stack (one 3×3 per
              incoming channel); the row swatch shows their average, but{" "}
              <b>click a conv-2 kernel</b> to see all eight slices. Toggle{" "}
              <b>Show wiring</b> for a simplified flow diagram: the input feeds
              each conv-1 map, pooling keeps the channel, then conv 2 pulls from{" "}
              <i>all</i> conv-1 channels at once (the fan-in) before its own
              pooling.
            </p>
          </footer>

          <Card className="cnn-panel" padding="md">
            <h2 className="cnn-h2">What deeper layers learn</h2>
            <p className="cnn-sub">
              Our network is too small, and digits too simple, for its second
              layer to show anything you would recognize. Here it is beside a
              bigger network trained on photos of faces, row by row. Both
              convolve and pool in turn, but the face network’s kernels are
              larger (10×10 and 14×14 rather than 3×3), and it has a third
              convolution. Each layer builds on the pooled maps of the one
              before it, so it sees a wider patch of the photo: edges, then
              face parts, then whole faces. Nobody told it what an eye is.
              Many modern networks go back to 3×3 kernels and reach wide
              patches by stacking many more layers instead.
            </p>
            <FaceHierarchy net={net} />
            <p className="cnn-note">
              The face network’s tiles are drawn in pixels. A conv-2 or conv-3
              kernel is a stack with one slice per incoming map, so, like our
              conv-2 swatches, each tile is a summary: the kernel projected back
              through the layers below it onto the photo.{" "}
              <FaceHierarchyCitation />
            </p>
          </Card>

          <Card className="cnn-panel" padding="md">
            <h2 className="cnn-h2">Pooling and stride</h2>
            <p className="cnn-sub">
              Pooling shrinks a feature map. A small window slides over the map,
              and each time it keeps only the largest number it sees. The{" "}
              <b>stride</b> is how many cells the window moves each step. Our
              network uses a 2×2 window with stride 2, so every map comes out
              half as wide. Change the window and the stride, then move over
              either map or press <b>Play</b>.
            </p>
            <PoolingStride />
            <p className="cnn-note">
              Keeping the largest number keeps the answer to “did the kernel
              find its pattern somewhere around here?” and drops exactly where.
              That makes the next layer a little less fussy about where a stroke
              sits, and gives it less to compute. A convolution can take a
              stride too: move the kernel two cells at a time and its map comes
              out half as wide. That is how the network below shrinks its maps.
            </p>
          </Card>

          <Card className="cnn-panel" padding="md" id="resnet">
            <h2 className="cnn-h2">A modern network</h2>
            <p className="cnn-sub">
              The face network is from 2009. Image networks since then are much
              deeper, and they went back to small kernels. ResNet-50, from 2015,
              is one of the most widely used. After its first layer, every
              kernel is 3×3 or 1×1. It sees a wide patch by stacking layers
              instead: 16 blocks of three, 50 layers with weights in all. By the
              last stage, each position’s view is wider than the whole photo.
              The same edges, parts and objects appear, spread over many more
              layers.
            </p>
            <ResNetStack />
            <h3 className="cnn-h3">Why the number of maps doubles</h3>
            <p className="cnn-sub">
              A layer makes one map per kernel: our conv 1 has 8 kernels and
              makes 8 maps. So to get more maps, a layer needs more kernels. Each
              time ResNet halves the width of its maps, it doubles the number of
              kernels, so the maps come out half as wide and twice as many (the
              stacks on the right). Two reasons:
            </p>
            <ul className="cnn-list">
              <li>
                <b>Deeper layers need more kinds of detector.</b> There are only
                a few directions an edge can run, but many kinds of eye, wheel,
                fur and face. Every kind needs its own kernel, and its own map.
              </li>
              <li>
                <b>Deeper layers can afford them.</b> A map half as wide has a
                quarter as many positions to compute. Doubling the maps coming in
                and going out makes each position four times the work. The two
                cancel, so every stage costs about the same. That is the rule
                the paper states.
              </li>
            </ul>
            <p className="cnn-note">
              The kernel colours are illustrative, not ResNet’s real weights: the
              size and the depth of each kernel are the point. Each block is
              drawn as a later block of its stage, which gets as many maps as it
              makes. The skip carries the block’s input around it and adds it
              back, so each block only has to learn a change to what it was
              given. That is what lets a network this deep train at all. Between
              stages there is no pooling layer: the first block of each stage
              halves the maps with a stride-2 convolution.{" "}
              <ResNetCitation />
            </p>
          </Card>

          <Card className="cnn-panel" padding="md">
            <h2 className="cnn-h2">Inside a block: the 1×1 kernel</h2>
            <p className="cnn-sub">
              Every ResNet block starts and ends with a kernel only one cell
              wide. That sounds useless, since a 1×1 kernel can’t see edges or
              shapes. What it can do is reach through <i>all</i> the maps under
              it. A kernel always does this: our conv-2 kernels are 3×3×8, one
              3×3 slice for each of the 8 maps. A 1×1×8 kernel is the same thing
              with each slice shrunk to one cell. It looks at one position,
              straight down through all the maps, and mixes them into one new
              map.
            </p>
            <OneByOne net={net} activations={activations} />
            <p className="cnn-note">
              In the second figure the weights are yours to set. A trained
              network learns them, the same way our conv-1 kernels were learned.
              The colour photo is made up for the example, and the greyscale
              recipe is the standard one, rounded.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
