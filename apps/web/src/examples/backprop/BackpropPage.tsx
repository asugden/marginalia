// The Backpropagation example (/examples/backpropagation).
//
// From "which way is up?" to a trained network, each idea shown by doing:
//   1. climb a drawn mountain by feel, choosing at a fork
//   2. the same walk on a real error landscape over two weights, in 3D
//   3. the activation example's neuron: drag a weight, watch the error
//   4. the chain rule, without numbers: open layers to break one derivative
//      apart (between layers they multiply, within a layer the routes add)
//   5. one path through a network: nudge a weight, the moves multiply
//   6. the whole network, clicked backwards one neuron at a time
//   7. that walk on repeat: training
// Every number is computed live by ./scalar.ts; every word is in
// ./content.ts. Panel 3 reuses the activation example's drawing parts and
// stylesheet so it reads as the same neuron.

import { Link } from "react-router-dom";
import { Wordmark } from "../../components/index.js";
import { renderProse } from "../shared/code-panel/highlight.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/figure.css";
import "../activation/activation.css";
import "./backprop.css";
import { ChainPanel } from "./ChainPanel.js";
import { ChainRulePanel } from "./ChainRulePanel.js";
import { ClimbPanel } from "./ClimbPanel.js";
import { LEDE } from "./content.js";
import { LandscapePanel } from "./LandscapePanel.js";
import { NeuronPanel } from "./NeuronPanel.js";
import { TrainPanel } from "./TrainPanel.js";
import { WalkPanel } from "./WalkPanel.js";

export function BackpropPage() {
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
        <div className="mnist-page bp-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Backpropagation</h1>
            <div className="mnist-lede">{renderProse(LEDE)}</div>
          </div>

          <ClimbPanel />
          <LandscapePanel />
          <NeuronPanel />
          <ChainRulePanel />
          <ChainPanel />
          <WalkPanel />
          <TrainPanel />
        </div>
      </div>
    </div>
  );
}
