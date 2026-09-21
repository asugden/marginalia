// The neural network overview (/examples/neural-networks).
//
// PLACEHOLDER. The first attempt at this page was a list of architectures with
// paragraphs explaining them — telling, where the whole point is showing. It
// has been taken down rather than left standing, and the page is deliberately
// empty until there is a diagram worth building.
//
// Whatever replaces this should follow the same two rules as the machine
// learning overview: everything clickable lives inside the diagram, and any
// claim that can be made by position, size, or shape is not also made in prose.

import { Link } from "react-router-dom";
import { Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "./overview.css";

export function NeuralNetworksPage() {
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
        <div className="ovw-page">
          <div className="mnist-head ovw-head">
            <p className="eyebrow">Overview</p>
            <h1>Neural networks</h1>
            <p className="mnist-lede">Not built yet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
