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
//   4. ReLU, GELU and SwiGLU, each drawn as input × gate = output: a hard
//      switch, a smooth one, and a learned one. Prose is the author's to
//      write; the card ships with bracketed placeholders.
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
import { GeluPanel } from "./GeluPanel.js";
import { GrowPanel } from "./GrowPanel.js";
import { NeuronPanel } from "./NeuronPanel.js";

export function ActivationPage() {
  // The story starts linear, so the first thing a student sees is what a
  // network cannot do without an activation.
  const [kind, setKind] = useState<Act>("none");
  // On by default: panel 1 draws its parts as the cells they were named
  // after. Off, the same parts are drawn as tiles and nodes. Panel 2 always
  // fits the coffee curve.
  const [bio, setBio] = useState(true);

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
            <h1>Activation functions</h1>
            <p className="mnist-lede">
              Each neuron in a layer is the sum of each of the inputs from the
              previous layer multiplied by learned weights and then passed
              through an <b>activation function</b>. This process is the key
              element of a neural network. Don't move on until it makes sense.
            </p>
          </div>

          {/* The bar is sticky within this wrapper only, so it stays pinned
              over the two panels it drives and scrolls away before the third,
              which compares activations side by side. */}
          <div className="af-followed">
            <div
              className="af-controls"
              role="group"
              aria-label="Activation function"
            >
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
                <Switch
                  label="Neuroscience"
                  checked={bio}
                  onChange={(e) => setBio(e.target.checked)}
                />
              </div>
            </div>

            <Card className="af-panel" padding="md">
              <h2 className="af-h2">One neuron</h2>
              <p className="af-sub">
                In the dark background section is one neuron from a layer. Above
                it are three input neurons. We default to viewing them as actual
                neurons from a brain. Triangular (pyramidal) neurons give
                positive outputs while circular (inhibitory) neurons give
                negative outputs.
                <br />
                <br />
                Just as the connection strengths between neurons are learned by
                the brain, the weights between artificial neural network layers
                are learned.
                <br />
                <br />
                The most important thing is that the summed inputs are then
                passed through an "activation function", which adjusts the
                output. Without the activation function, the neural network
                cannot do its job (see next section). You can think of it as
                similar to the brain again, where a neuron only fires when
                enough of its inputs activate. In fact, it looks a lot like a
                sigmoid function.
              </p>
              <NeuronPanel kind={kind} bio={bio} />
            </Card>

            <Card className="af-panel" padding="md">
              <h2 className="af-h2">Non-linear functions fit anything</h2>
              <p className="af-sub">
                As we said above, non-linear functions are required for a neural
                network to work. The universal approximation theorem states that
                non-linear functions can be combined to fit any function (if
                there are enough; strictly, the functions must be
                non-polynomial). That is to say, with more and more copies of
                simple non-linear functions, our model can solve any problem.
                That's the key trick of an LLM. Notice here that it can be any
                non-linear function, but it just can't be linear.
              </p>
              <GrowPanel kind={kind} onPickKind={setKind} />
            </Card>
          </div>

          <Card className="af-panel" padding="md">
            <h2 className="af-h2">Why ReLU won</h2>
            <p className="af-sub">
              Neural networks are trained by measuring their derivatives. We can
              get an intuition into this by looking at the activation function
              above. The slope of the function is its derivative. The steepest
              slope of a sigmoid is 0.25, whereas a ReLU is 1.0 throughout. This
              becomes a problem in fixing errors. In a deep network, the error
              gets scaled in each layer, getting smaller and smaller to the
              point of being inconsequential.
              <br />
              <br />
              The tanh is better, but suffers from the same problem at the
              extremes.
            </p>
            <DepthPanel />
          </Card>

          <Card className="af-panel" padding="md">
            <h2 className="af-h2">One last problem</h2>
            <p className="af-sub">
              ReLU led to the massive innovations in neural networks, but it
              still isn't perfect. Specifically, if the value ever goes below 0,
              the output is <b>always zero</b>. That means that -0.1 and -one
              million lead to the same output. These neurons can be thought of
              as "lost".
              <br />
              <br />
              The most recent innovations are GeLU and SwiGLU. ReLU is a
              rectified linear unit (i.e. it is linear, but anything below 0 is
              set to 0). GeLU is the Gaussian Error linear unit. Rather than a
              rectifying function or "gate", it uses a Gaussian error function.
              <br />
              <br />
              Specifically in transformers, they can do even better if they can
              learn their own error functions. The "Swish" function was designed
              to allow that. It can approximate a linear function, a GeLU, and a
              ReLU, depending on the learned values. The top LLMs use SwiGLUs
              today.
            </p>
            <GeluPanel />
          </Card>
        </div>
      </div>
    </div>
  );
}
