// The fitting-complex-shapes example (/examples/complex-shapes).
//
// Two ideas the other examples lean on without stopping for: a model with
// more parameters can take on more shapes (the activation example's network
// gaining neurons, XGBoost's fit sharpening as trees are added), and a model
// with enough of them fits the noise as well as the shape (XGBoost's test
// error turning back up). Both are shown here on their own, with the smallest
// models that make them visible.
//
// One choice runs through both panels, on a pinned bar: build the curve from
// steps, the shapes a regression tree makes, or from bends, the shapes a
// network of ReLU neurons makes. The slider in each panel counts parameters,
// and the budget survives a switch between the two, so the reader can ask
// which does more with the same count.
//
//   1. Draw a shape. No noise; more parameters only ever help.
//   2. Overfitting. One day's traffic counts, scored on the next day's.
//
// Show, don't tell: a sentence per panel, and the figures carry the rest.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/controls.css";
import "../shared/figure.css";
import "./complex-shapes.css";
import { DrawPanel } from "./DrawPanel.js";
import { KindGlyph } from "./draw.js";
import type { Kind } from "./fit.js";
import { NoisePanel } from "./NoisePanel.js";

const KINDS: Array<[Kind, string]> = [
  ["steps", "Steps"],
  ["bends", "Bends"],
];

export function ComplexShapesPage() {
  const [kind, setKind] = useState<Kind>("steps");

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
            <h1>Fitting complex shapes</h1>
            <p className="mnist-lede">
              A model builds its curve out of simple pieces: flat steps, the way
              a <Link to="/examples/decision-tree">decision tree</Link> does, or
              straight lines with bends, the way a network of{" "}
              <Link to="/examples/activation-function">ReLU neurons</Link> does.
              Every piece costs parameters.
            </p>
          </div>

          <div className="ex-followed">
            <div className="ex-controls" role="group" aria-label="Pieces">
              <div className="ex-controls__row">
                <span className="ex-controls__label">Built from</span>
                <div className="ex-controls__buttons">
                  {KINDS.map(([k, label]) => (
                    <Button
                      key={k}
                      size="sm"
                      variant={k === kind ? "primary" : "subtle"}
                      icon={<KindGlyph kind={k} />}
                      aria-pressed={k === kind}
                      onClick={() => setKind(k)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <Card className="cs-panel" padding="md">
              <h2 className="cs-h2">Draw a shape</h2>
              <p className="cs-sub">
                Draw over the heartbeat, or draw anything. Then give the model
                more parameters.
              </p>
              <DrawPanel kind={kind} />
              <p className="cs-note">
                Each curve is the best of its size, found exactly, so it is the
                same every time.
              </p>
            </Card>

            <Card className="cs-panel" padding="md">
              <h2 className="cs-h2">Overfitting</h2>
              <p className="cs-sub">
                Each dot is the traffic past one spot on a road, counted every
                half hour. Fit today's counts, then see how the fit does on the
                next day's.
              </p>
              <NoisePanel kind={kind} />
              <p className="cs-note">The counts are illustrative, not from a real road.</p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
