// The shape of every supervised learning problem, drawn in the same voice as
// the language model's pipeline: one SVG, left to right, each stage drawn as
// the shape its data takes, named underneath in the figure label voice.
//
//   data      ragged raw records, in a dashed sheet: nothing is a number yet.
//             It sits above and to the left of the row, and a right-angled
//             arrow drops from it into features: the offset is the transform.
//   features  the records as a clean grid, one row each.
//   model     the one part of the row you *choose*: a single heavy square,
//             split corner to corner — the upper left open, the lower right
//             filled — the range from open box to black box.
//   labels    one answer per row, the only accented column.
//
// Features and labels share their four rows, so the eye reads each record
// going in and coming out as one answer without being told.
//
// Off the right of `labels` the answer forks into what it can be. Categorization
// hangs off classification rather than the trunk, and further right: a category
// is the yes/no question asked of many classes at once, so it sits downstream of
// classification, not beside it.
//
// This is a diagram, not a control panel. Nothing here is clickable.

import "../shared/figure.css";

const W = 960;
const PITCH = 18;
const OFFSETS = [-1.5, -0.5, 0.5, 1.5].map((k) => k * PITCH);
// Data's rows, up top; the row everything else sits on, below it.
const DATA_MID = 78;
const DATA_ROWS = OFFSETS.map((d) => DATA_MID + d);
const MID = 170;
const ROWS = OFFSETS.map((d) => MID + d);
const H = MID + 84;
const SHEET_BOTTOM = DATA_ROWS[3]! + 9 + PITCH / 2;

// The same visitors the spreadsheet below uses.
const RECORDS = [
  { raw: "14s phone 9pm", label: "yes" },
  { raw: "2s laptop 9am", label: "no" },
  { raw: "47s phone 10pm", label: "yes" },
  { raw: "8s laptop 1pm", label: "no" },
];

// Where each kind of answer sits: its glyph's left edge and its row.
const CLS = { x: 560, y: MID - 52 };
const CAT = { x: 596, y: MID };
const REG = { x: 560, y: MID + 52 };

export function PipelineFigure() {
  return (
    <figure className="ovw-fig">
      <svg
        className="ovw-pipe"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="Raw data is transformed into features, one row of numbers per record; a model you choose, anywhere from an open box to a black box, maps each row to a label. A label is a classification — true or false, yes or no, or a probability, and downstream of that a category — or a regression, a number."
      >
        <defs>
          <marker id="ovw-pipe-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="ovw-pipe__head" />
          </marker>
          <marker id="ovw-pipe-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="ovw-pipe__head ovw-pipe__head--on" />
          </marker>
        </defs>

        {/* Data: raw records, ragged, in a dashed sheet, named above it. */}
        <text className="fig-label" x={58} y={12} textAnchor="middle">
          data
        </text>
        <text className="fig-label-sub" x={58} y={25} textAnchor="middle">
          logs, forms, files
        </text>
        <rect className="ovw-pipe__sheet" x={2} y={DATA_ROWS[0]! - 17} width={112} height={4 * PITCH + 16} rx={6} />
        {RECORDS.map((r, i) => (
          <text key={i} className="fig-word" x={12} y={DATA_ROWS[i]! + 4}>
            {r.raw}
          </text>
        ))}

        {/* The transform: down out of data, then right into features. */}
        <path className="ovw-pipe__elbow" d={`M 58 ${SHEET_BOTTOM + 6} V ${MID} H 154`} markerEnd="url(#ovw-pipe-arrow)" />

        {/* Features: the same records, now a grid of numbers. */}
        {ROWS.map((y, i) =>
          Array.from({ length: 4 }, (_, c) => (
            <rect key={`${i}-${c}`} className="ovw-pipe__cell" x={162 + c * 24} y={y - 7} width={24} height={14} />
          )),
        )}
        <Caption x={210} label="features" sub="a row of numbers each" />

        <Arrow x1={268} x2={302} />

        {/* Model: open box (upper left) to black box (lower right). */}
        <polygon className="ovw-pipe__black" points={`382,${MID - 35} 382,${MID + 35} 312,${MID + 35}`} />
        <rect className="ovw-pipe__model" x={312} y={MID - 35} width={70} height={70} />
        <Caption x={347} label="model" sub="the part you choose" />

        <Arrow x1={392} x2={426} />

        {/* Labels: one answer per row. */}
        {RECORDS.map((r, i) => (
          <g key={i}>
            <rect className="ovw-pipe__label" x={434} y={ROWS[i]! - 7} width={40} height={14} rx={2} />
            <text className="fig-tick ovw-pipe__label-text" x={454} y={ROWS[i]! + 3} textAnchor="middle">
              {r.label}
            </text>
          </g>
        ))}
        <Caption x={454} label="labels" sub="one answer per row" on />

        {/* The fork: a trunk off `labels`, curving up and down to the two
            first-level kinds. */}
        <path className="ovw-pipe__fork" d={`M 482 ${MID} H 502 C 524 ${MID} 520 ${CLS.y} 548 ${CLS.y}`} markerEnd="url(#ovw-pipe-arrow-on)" />
        <path className="ovw-pipe__fork" d={`M 502 ${MID} C 524 ${MID} 520 ${REG.y} 548 ${REG.y}`} markerEnd="url(#ovw-pipe-arrow-on)" />
        {/* Categorization drops out of classification, not the trunk. */}
        <path className="ovw-pipe__fork" d={`M 574 ${CLS.y + 10} V ${CAT.y - 6} Q 574 ${CAT.y} 580 ${CAT.y} H 586`} markerEnd="url(#ovw-pipe-arrow-on)" />

        {/* Classification: a probability, read as yes or no. */}
        <rect className="ovw-pipe__track" x={CLS.x} y={CLS.y - 5} width={56} height={10} rx={2} />
        <rect className="ovw-pipe__bar" x={CLS.x} y={CLS.y - 5} width={56 * 0.82} height={10} rx={2} />
        <Kind
          x={CLS.x + 68}
          y={CLS.y}
          name="classification"
          shape="true / false · yes / no · a probability"
          example="will someone click on this ad"
        />

        {/* Categorization: one of several. */}
        {[0, 1, 2].map((c) => (
          <rect
            key={c}
            className={c === 1 ? "ovw-pipe__chip ovw-pipe__chip--on" : "ovw-pipe__chip"}
            x={CAT.x + c * 19}
            y={CAT.y - 7}
            width={16}
            height={14}
            rx={2}
          />
        ))}
        <Kind
          x={CAT.x + 68}
          y={CAT.y}
          name="categorization"
          shape="one of several categories"
          example="what kind of song is this"
        />

        {/* Regression: a point on a number line. */}
        <line className="ovw-pipe__axis" x1={REG.x} y1={REG.y + 4} x2={REG.x + 56} y2={REG.y + 4} />
        {[0, 1, 2, 3].map((t) => (
          <line key={t} className="ovw-pipe__axis" x1={REG.x + t * (56 / 3)} y1={REG.y + 1} x2={REG.x + t * (56 / 3)} y2={REG.y + 7} />
        ))}
        <circle className="ovw-pipe__dot" cx={REG.x + 38} cy={REG.y + 4} r={4} />
        <Kind
          x={REG.x + 68}
          y={REG.y}
          name="regression"
          shape="a number"
          example="how many seconds you'll stay on the website"
        />
      </svg>
    </figure>
  );
}

function Caption({ x, label, sub, on }: { x: number; label: string; sub: string; on?: boolean }) {
  return (
    <>
      <text className={`fig-label${on ? " ovw-pipe__on" : ""}`} x={x} y={MID + 62} textAnchor="middle">
        {label}
      </text>
      <text className="fig-label-sub" x={x} y={MID + 75} textAnchor="middle">
        {sub}
      </text>
    </>
  );
}

function Kind({ x, y, name, shape, example }: { x: number; y: number; name: string; shape: string; example: string }) {
  return (
    <>
      <text className="fig-label ovw-pipe__on" x={x} y={y - 11}>
        {name}
      </text>
      <text className="fig-num" x={x} y={y + 3}>
        {shape}
      </text>
      <text className="fig-note ovw-pipe__eg" x={x} y={y + 17}>
        {example}
      </text>
    </>
  );
}

function Arrow({ x1, x2 }: { x1: number; x2: number }) {
  return <line className="ovw-pipe__series" x1={x1} y1={MID} x2={x2} y2={MID} markerEnd="url(#ovw-pipe-arrow)" />;
}
