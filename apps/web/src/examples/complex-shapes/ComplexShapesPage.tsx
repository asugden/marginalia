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
//   2. Overfitting. One day's traffic counts (training), scored on the next
//      day's (test).
//   3. Holding out data. No next day: set some of one day's counts aside.
//   4. Choosing without peeking. Split three ways; choose the size on
//      validation, report on test.
//
// Show, don't tell: a sentence per panel, and the figures carry the rest.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/controls.css";
import "../shared/figure.css";
import "./complex-shapes.css";
import { KindGlyph } from "./draw.js";
import { DrawPanel } from "./DrawPanel.js";
import type { Kind } from "./fit.js";
import { NoisePanel } from "./NoisePanel.js";
import { HoldOutPanel, ValidationPanel } from "./SplitPanels.js";

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
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Fitting and Overfitting</h1>
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
              <p className="cs-note">
                The counts are illustrative, not from a real road.
              </p>
            </Card>

            <Card className="cs-panel" padding="md">
              <h2 className="cs-h2">Holding out data</h2>
              <p className="cs-sub">
                There is rarely a next day to wait for. Instead, set some of
                today's counts aside before fitting, and score the model on
                those. Reshuffle to set aside different ones.
              </p>
              <HoldOutPanel kind={kind} />
              <p className="cs-note">
                The model never sees the test counts while it is fitted. That is
                the whole trick: they stand in for traffic that has not happened
                yet.
              </p>
            </Card>

            <Card className="cs-panel" padding="md">
              <h2 className="cs-h2">Choosing without peeking</h2>
              <p className="cs-sub">
                Pick the size with the best test score and the test counts stop
                being a fair test: they chose the model. So split three ways:
                fit on training, choose the size on validation, and look at the
                test score once, at the end.
              </p>
              <ValidationPanel kind={kind} />
              <p className="cs-note">
                The chosen size had the lowest validation miss out of every size
                tried, so that miss is partly luck. The test counts played no
                part in the choice, so their miss is the honest one.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
