// The large-language-models example (/examples/language-models).
//
// From a Markov chain of words to a language model at real scale:
//
//   1. Markov chain of words. The current state (one word or two), the
//      counted options for the next word, a draw, repeat.
//   2. Tokens in, a token out. What the model actually reads and writes.
//   3. One word at a time. The whole model as one pass, run once per token,
//      with the same slot as panel 1 — but the state is the whole text.
//   4. A pointer to the counting parameters example, which now carries the
//      grid of real models' shapes ("Make it bigger!").

import { Link } from "react-router-dom";
import { Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/figure.css";
import { GeneratePanel } from "./GeneratePanel.js";
import "./language-models.css";
import { MarkovPanel } from "./MarkovPanel.js";
import { TokenizerPanel } from "./TokenizerPanel.js";

export function LanguageModelsPage() {
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
            <h1>Large language models</h1>
            <p className="mnist-lede">
              A large langauge model (LLM) plays a simple and repetitive game:
              predict the next most likely possible word based on the current
              combination of questions and answers, chose one word amongst the
              possibilities to append, and start over.
            </p>
          </div>

          <MarkovPanel />
          <TokenizerPanel />
          <GeneratePanel />

          <Card className="lm-panel" padding="md">
            <h2 className="lm-h2">How big they get</h2>
            <p className="lm-sub">
              Real models run a word through dozens of transformer blocks, each
              with dozens of attention heads. Their shapes, and where their
              parameters go, are in{" "}
              <Link to="/examples/parameter-budget">Counting Parameters</Link>.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
