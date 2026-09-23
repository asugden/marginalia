// The activation-functions example (/examples/activation-function).
//
// Three panels, each the digit recognizer's shape — controls on the left, one
// live figure on the right — and one choice driving the first two: which
// activation function the neurons use.
//
//   1. One neuron. Inputs times weights, plus a bias, summed; then the
//      activation. Every number is on the drawing and every one moves. A
//      toggle renames the parts in the neuroscience they came from.
//   2. Grow a network. A tuning curve from visual cortex, fitted by a network
//      the student widens one neuron at a time. With no activation the fit
//      stays a straight line however wide the network gets, and the page
//      collapses the network into that line from its own weights. With ReLU,
//      each neuron is a bend.
//   3. Why ReLU won. A sigmoid chain and a ReLU chain, identical otherwise.
//      Move the input; down the sigmoid chain the change fades to nothing.
//
// Show, don't tell: the prose on the page is a sentence per panel. This page
// is used in class, after an introduction; the figures carry the argument.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Switch, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/figure.css";
import { ACTS, ACT_NAME, type Act } from "./act.js";
import "./activation.css";
import { DepthPanel } from "./DepthPanel.js";
import { Glyph } from "./draw.js";
import { GrowPanel } from "./GrowPanel.js";
import { NeuronPanel } from "./NeuronPanel.js";

export function ActivationPage() {
  // The story starts linear, so the first thing a student sees is what a
  // network cannot do without an activation.
  const [kind, setKind] = useState<Act>("none");
  // Off by default so the page works for anyone: panel 2 fits a coffee curve.
  // On, the parts take their neuroscience names and panel 2 fits a tuning
  // curve from visual cortex instead.
  const [bio, setBio] = useState(false);

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
            <h1>Activation functions</h1>
            <p className="mnist-lede">
              A neuron adds up its inputs, each multiplied by a weight, and
              passes the sum through an activation function. Pick the function
              here and it applies to the first two panels.
            </p>
          </div>

          {/* The bar is sticky within this wrapper only, so it stays pinned
              over the two panels it drives and scrolls away before the third,
              which compares activations side by side. */}
          <div className="af-followed">
            <div className="af-controls" role="group" aria-label="Activation function">
              <span className="af-controls__label">Activation</span>
              <div className="af-controls__buttons">
                {ACTS.map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant={a === kind ? "primary" : "subtle"}
                    icon={<Glyph kind={a} />}
                    onClick={() => setKind(a)}
                    aria-pressed={a === kind}
                  >
                    {ACT_NAME[a]}
                  </Button>
                ))}
              </div>
              <div className="af-controls__end">
                <Switch label="Neuroscience" checked={bio} onChange={(e) => setBio(e.target.checked)} />
              </div>
            </div>

            <Card className="af-panel" padding="md">
              <h2 className="af-h2">One neuron</h2>
              <p className="af-sub">
                Set the inputs and the weights. Make the sum go negative and see
                what each activation does with it.
              </p>
              <NeuronPanel kind={kind} bio={bio} />
            </Card>

            <Card className="af-panel" padding="md">
              <h2 className="af-h2">Add neurons</h2>
              <p className="af-sub">
                {bio ? (
                  <>
                    The dots are a neuron in visual cortex that fires most for a
                    bar tilted at 60°. Fit it with a network, then give the
                    network more neurons.
                  </>
                ) : (
                  <>
                    The dots are how much someone enjoys a cup of coffee at each
                    temperature: too cold, just right, too hot. Fit them with a
                    network, then give the network more neurons.
                  </>
                )}
              </p>
              <GrowPanel key={bio ? "cortex" : "coffee"} kind={kind} bio={bio} onPickKind={setKind} />
              <p className="af-note">
                {bio
                  ? "The dots are an idealised tuning curve, not a recording."
                  : "The dots are an illustrative curve, not a survey."}{" "}
                Each fit is the best a network of that size and activation can
                do, found by gradient descent in your browser — the same result
                every time.
              </p>
            </Card>
          </div>

          <Card className="af-panel" padding="md">
            <h2 className="af-h2">Why ReLU won</h2>
            <p className="af-sub">
              The sigmoid came first because it looks like a real neuron: silent,
              then firing, then flat out at its fastest rate. Stack it and move
              the input.
            </p>
            <DepthPanel />
            <p className="af-note">
              Every layer here has weight 1 and no bias, so the activation is the
              only difference. The bar is how much a neuron moves when the input
              moves — the number training uses to decide how to change the early
              weights. A sigmoid's slope is never more than ¼, so each layer
              shrinks it at least fourfold; a ReLU passes it on whole. Deep
              networks trained with ReLU from 2010 (Nair &amp; Hinton; Glorot,
              Bordes &amp; Bengio, 2011), and AlexNet's 2012 image-recognition
              result used it throughout.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
