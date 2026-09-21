// The machine learning overview (/examples/machine-learning).
//
// A map, not a lesson. Three figures, each of which makes its point by being
// looked at rather than read: the shape every problem shares, the one
// spreadsheet everything fits in, and the line every model sits on.
//
// Two rules this page follows and should keep following:
//
//   1. Everything clickable lives INSIDE a diagram. No navigation cards, no
//      "next" buttons, no link lists. The way onward to another example is to
//      click the thing itself on the line.
//   2. Show, don't tell. Where a claim can be made by position, size, or a
//      dividing line, it is not also made in a paragraph.

import { Link } from "react-router-dom";
import { Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "./overview.css";
import { PipelineFigure } from "./PipelineFigure.js";
import { SheetFigure, type Column, type Row } from "./SheetFigure.js";
import { ComplexityLine } from "./ComplexityLine.js";

// The same five columns in both states. Only two of them actually change,
// which is the point: "turning data into features" is usually a couple of
// specific decisions, not a wholesale rewrite.
const COLUMNS: Column[] = [
  { raw: "time on page", feature: "time_on_page", changes: true },
  { raw: "device", feature: "is_mobile", changes: true },
  { raw: "past clicks", feature: "past clicks", changes: false },
  { raw: "hour", feature: "hour", changes: false },
];

const ROWS: Row[] = [
  { raw: ["14s", "phone", "3", "21"], feature: ["14.0", "true", "3", "21"], label: "yes" },
  { raw: ["2s", "laptop", "0", "09"], feature: ["2.0", "false", "0", "09"], label: "no" },
  { raw: ["47s", "phone", "1", "22"], feature: ["47.0", "true", "1", "22"], label: "yes" },
  { raw: ["8s", "laptop", "2", "13"], feature: ["8.0", "false", "2", "13"], label: null },
  { raw: ["31s", "phone", "0", "19"], feature: ["31.0", "true", "0", "19"], label: null },
];

const TRAIN_COUNT = 3;

export function MachineLearningPage() {
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
            <h1>What machine learning is</h1>
            <p className="mnist-lede">
              {/* PLACEHOLDER — your words. */}
              A map of the whole subject. The shape every problem shares, the
              one spreadsheet it all fits in, and the line every model sits on.
            </p>
          </div>

          <section className="ovw-part" aria-labelledby="p-shape">
            <h2 id="p-shape" className="ovw-h2">
              One shape, every time
            </h2>
            <p className="ovw-lede">
              {/* PLACEHOLDER — your words. */}
            </p>
            <PipelineFigure />
          </section>

          <section className="ovw-part" aria-labelledby="p-sheet">
            <h2 id="p-sheet" className="ovw-h2">
              It all fits in one spreadsheet
            </h2>
            <p className="ovw-lede">
              {/* PLACEHOLDER — your words. */}
            </p>
            <SheetFigure
              columns={COLUMNS}
              label="clicked"
              rows={ROWS}
              trainCount={TRAIN_COUNT}
            />
          </section>

          <section aria-labelledby="p-line">
            <h2 id="p-line" className="ovw-h2 ovw-h2--line">
              Which model do you reach for?
            </h2>
            <p className="ovw-lede">
              {/* PLACEHOLDER — your words. */}
            </p>
          </section>
        </div>

        {/* Full-bleed: the pinned line runs edge to edge, outside the page
            frame the prose sits in. */}
        <ComplexityLine />
      </div>
    </div>
  );
}
