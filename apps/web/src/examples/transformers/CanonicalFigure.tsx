// The figure from "Attention Is All You Need" (Vaswani et al., 2017),
// redrawn, with every box translated into something built on this page or
// the attention page.
//
// The figure is famous and, to most readers, opaque: a stack of coloured
// boxes joined by arrows, two towers, an N×, and no hint of what any of it
// does. Part of that is real specificity — it draws an encoder–decoder
// translation model, which is more machinery than a modern language model
// has — and part is that the boxes are named after the mathematics rather
// than the idea. So this panel does two things. It keeps the original layout
// and colours, so the student can recognise the figure when they meet it
// elsewhere; and it pairs every box with a plain sentence and a pointer to
// the panel where they watched it happen. Hover a box to find its sentence,
// hover a sentence to find its boxes.
//
// A toggle fades everything this page did not build: the decoder tower, the
// mask, cross-attention, and the output layers. What remains lit is the
// encoder, which is exactly the block above.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/index.js";

type Concept =
  | "embed"
  | "pos"
  | "mha"
  | "addnorm"
  | "ff"
  | "nx"
  | "masked"
  | "cross"
  | "out";

interface Legend {
  id: Concept;
  label: string;
  swatch: string;
  here: string;
  link?: { to: string; text: string };
  later?: boolean;
}

const LEGEND: Legend[] = [
  {
    id: "embed",
    label: "Input Embedding",
    swatch: "embed",
    here: "Each word is converted to a vector (a list of numbers):",
    link: { to: "/examples/word2vec", text: "word embeddings" },
  },
  {
    id: "pos",
    label: "Positional Encoding ⊕",
    swatch: "pos",
    here: "Each word embedding is offset by a unique position vector marking where in the input it lies:",
    link: { to: "/examples/attention", text: "attention, last panel" },
  },
  {
    id: "mha",
    label: "Multi-Head Attention",
    swatch: "mha",
    here: "Multiple attention heads enable extracting different kinds of connections between words:",
    link: { to: "#tf-heads", text: "panel 2" },
  },
  {
    id: "addnorm",
    label: "Add & Norm",
    swatch: "addnorm",
    here: "The output of attention is added and rescaled:",
    link: { to: "#tf-addnorm", text: "panel 3" },
  },
  {
    id: "ff",
    label: "Feed Forward",
    swatch: "ff",
    here: "Additional fully connected layers have been found to add fact information to the embeddings via another additive step:",
    link: { to: "#tf-memory", text: "panel 4" },
  },
  {
    id: "nx",
    label: "N ×",
    swatch: "nx",
    here: "The transformer block can be repeated in serial (one after another), each containing unique learned matrices:",
    link: { to: "#tf-stack", text: "panel 5" },
  },
  {
    id: "masked",
    label: "Masked Multi-Head Attention",
    swatch: "mha",
    here: "The same multi-headed attention concept in which all words after the current one are hidden. This is a key concept in creating training data for large language models (LLMs):",
    later: true,
  },
  {
    id: "cross",
    label: "Multi-Head Attention, fed from the encoder",
    swatch: "mha",
    here: "We have only considered self-attention above-- comparing a sentence to itself. However, we can compare two different inputs such as a sentence in English and another in French. This is called cross-attention.",
    later: true,
  },
  {
    id: "out",
    label: "Linear → Softmax → Output Probabilities",
    swatch: "out",
    here: "The output of the transformer can be turned into probabilities via",
    link: { to: "/examples/softmax", text: "softmax" },
    later: true,
  },
];

// Which tower each concept's boxes sit in, for the "ours only" fade.
const LATER = new Set<Concept>(["masked", "cross", "out"]);

export function CanonicalFigure() {
  const [active, setActive] = useState<Concept | null>(null);
  const [oursOnly, setOursOnly] = useState(false);

  // A box's classes: lit when its concept is hovered, dimmed when another is,
  // faded when it belongs to the part this page did not build.
  const cls = (c: Concept, decoder = false) =>
    [
      "tf-cf__blk",
      active === c
        ? "tf-cf__blk--on"
        : active !== null
          ? "tf-cf__blk--dim"
          : "",
      oursOnly && (LATER.has(c) || decoder) ? "tf-cf__later" : "",
    ]
      .filter(Boolean)
      .join(" ");
  const enter = (c: Concept) => () => setActive(c);
  const leave = () => setActive(null);

  return (
    <div className="tf-cf">
      <div className="tf-cf__figcol">
        <div className="tf-cf__bar">
          <Button
            size="sm"
            variant={oursOnly ? "primary" : "subtle"}
            onClick={() => setOursOnly((v) => !v)}
          >
            {oursOnly
              ? "Showing what this page built"
              : "Show only what this page built"}
          </Button>
        </div>
        <svg
          className="tf-fig tf-cf__fig"
          viewBox="0 0 420 600"
          role="img"
          aria-label="The transformer figure from Attention Is All You Need: an encoder tower on the left and a decoder tower on the right, each a stack of attention, add and norm, and feed-forward blocks, repeated N times."
        >
          <defs>
            <marker
              id="tf-cf-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0.5 L8,4 L0,7.5 Z" className="tf-cf__head" />
            </marker>
          </defs>

          {/* ── Encoder tower ── */}
          <g className={oursOnly ? "" : ""}>
            <rect
              className="tf-cf__panel"
              x={50}
              y={214}
              width={160}
              height={226}
              rx={10}
            />
            {oursOnly && (
              <text
                className="tf-cf__towercap tf-cf__towercap--ours"
                x={130}
                y={206}
                textAnchor="middle"
              >
                the encoder — this page
              </text>
            )}
            <text
              className={`tf-cf__nx ${cls("nx")}`}
              x={30}
              y={330}
              textAnchor="middle"
              onMouseEnter={enter("nx")}
              onMouseLeave={leave}
            >
              N×
            </text>

            <text className="tf-cf__io" x={130} y={588} textAnchor="middle">
              Encoder Inputs
            </text>
            <line
              className="tf-cf__line"
              x1={130}
              y1={574}
              x2={130}
              y2={550}
              markerEnd="url(#tf-cf-arrow)"
            />
            <g
              className={cls("embed")}
              onMouseEnter={enter("embed")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--embed"
                x={70}
                y={512}
                width={120}
                height={36}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={130}
                y={527}
                textAnchor="middle"
              >
                Encoder Input
              </text>
              <text
                className="tf-cf__label"
                x={130}
                y={541}
                textAnchor="middle"
              >
                Embedding
              </text>
            </g>
            <line
              className="tf-cf__line"
              x1={130}
              y1={512}
              x2={130}
              y2={486}
              markerEnd="url(#tf-cf-arrow)"
            />
            <g
              className={cls("pos")}
              onMouseEnter={enter("pos")}
              onMouseLeave={leave}
            >
              <circle className="tf-cf__plus" cx={130} cy={474} r={10} />
              <text
                className="tf-cf__plussign"
                x={130}
                y={478}
                textAnchor="middle"
              >
                +
              </text>
              <circle className="tf-cf__sine" cx={86} cy={474} r={15} />
              <path
                className="tf-cf__sinewave"
                d="M 74 474 q 6 -12 12 0 t 12 0"
              />
              <line
                className="tf-cf__line"
                x1={101}
                y1={474}
                x2={118}
                y2={474}
              />
              <text className="tf-cf__io" x={30} y={470} textAnchor="middle">
                Positional
              </text>
              <text className="tf-cf__io" x={30} y={483} textAnchor="middle">
                Encoding
              </text>
            </g>
            <line className="tf-cf__line" x1={130} y1={464} x2={130} y2={428} />
            {/* three arrows into attention: Q, K, V */}
            <path
              className="tf-cf__line"
              d="M 130 428 L 110 420 L 110 407"
              markerEnd="url(#tf-cf-arrow)"
            />
            <path
              className="tf-cf__line"
              d="M 130 428 L 130 407"
              markerEnd="url(#tf-cf-arrow)"
            />
            <path
              className="tf-cf__line"
              d="M 130 428 L 150 420 L 150 407"
              markerEnd="url(#tf-cf-arrow)"
            />
            <g
              className={cls("mha")}
              onMouseEnter={enter("mha")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--mha"
                x={70}
                y={368}
                width={120}
                height={38}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={130}
                y={384}
                textAnchor="middle"
              >
                Multi-Head
              </text>
              <text
                className="tf-cf__label"
                x={130}
                y={398}
                textAnchor="middle"
              >
                Attention
              </text>
            </g>
            <line
              className="tf-cf__line"
              x1={130}
              y1={368}
              x2={130}
              y2={354}
              markerEnd="url(#tf-cf-arrow)"
            />
            {/* skip 1 */}
            <path
              className="tf-cf__line"
              d="M 130 444 L 58 444 L 58 340 L 68 340"
              markerEnd="url(#tf-cf-arrow)"
            />
            <g
              className={cls("addnorm")}
              onMouseEnter={enter("addnorm")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--addnorm"
                x={70}
                y={328}
                width={120}
                height={24}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={130}
                y={344}
                textAnchor="middle"
              >
                Add &amp; Norm
              </text>
            </g>
            <line
              className="tf-cf__line"
              x1={130}
              y1={328}
              x2={130}
              y2={306}
              markerEnd="url(#tf-cf-arrow)"
            />
            {/* skip 2 */}
            <path
              className="tf-cf__line"
              d="M 130 316 L 58 316 L 58 238 L 68 238"
              markerEnd="url(#tf-cf-arrow)"
            />
            <g
              className={cls("ff")}
              onMouseEnter={enter("ff")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--ff"
                x={70}
                y={266}
                width={120}
                height={38}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={130}
                y={282}
                textAnchor="middle"
              >
                Feed
              </text>
              <text
                className="tf-cf__label"
                x={130}
                y={296}
                textAnchor="middle"
              >
                Forward
              </text>
            </g>
            <line
              className="tf-cf__line"
              x1={130}
              y1={266}
              x2={130}
              y2={252}
              markerEnd="url(#tf-cf-arrow)"
            />
            <g
              className={cls("addnorm")}
              onMouseEnter={enter("addnorm")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--addnorm"
                x={70}
                y={226}
                width={120}
                height={24}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={130}
                y={242}
                textAnchor="middle"
              >
                Add &amp; Norm
              </text>
            </g>
            {/* encoder output, across to the decoder's cross-attention */}
            <path
              className={`tf-cf__line ${cls("cross", true)}`}
              d="M 130 226 L 130 196 L 220 196 L 220 322 L 300 322"
              onMouseEnter={enter("cross")}
              onMouseLeave={leave}
            />
            <path
              className={`tf-cf__line ${cls("cross", true)}`}
              d="M 296 322 L 296 315"
              markerEnd="url(#tf-cf-arrow)"
            />
            <path
              className={`tf-cf__line ${cls("cross", true)}`}
              d="M 300 322 L 324 322 L 324 315"
              markerEnd="url(#tf-cf-arrow)"
            />
          </g>

          {/* ── Decoder tower ── */}
          <g>
            <rect
              className={`tf-cf__panel${oursOnly ? " tf-cf__later" : ""}`}
              x={230}
              y={100}
              width={160}
              height={340}
              rx={10}
            />
            {oursOnly && (
              <text
                className="tf-cf__towercap"
                x={310}
                y={118}
                textAnchor="middle"
              >
                the decoder — later
              </text>
            )}
            <text
              className={`tf-cf__nx ${cls("nx", true)}`}
              x={406}
              y={270}
              textAnchor="middle"
              onMouseEnter={enter("nx")}
              onMouseLeave={leave}
            >
              N×
            </text>

            <text
              className={`tf-cf__io${oursOnly ? " tf-cf__later" : ""}`}
              x={310}
              y={588}
              textAnchor="middle"
            >
              Decoder Inputs
            </text>
            <line
              className={`tf-cf__line${oursOnly ? " tf-cf__later" : ""}`}
              x1={310}
              y1={574}
              x2={310}
              y2={550}
              markerEnd="url(#tf-cf-arrow)"
            />
            <g
              className={cls("embed", true)}
              onMouseEnter={enter("embed")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--embed"
                x={250}
                y={512}
                width={120}
                height={36}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={310}
                y={527}
                textAnchor="middle"
              >
                Decoder Input
              </text>
              <text
                className="tf-cf__label"
                x={310}
                y={541}
                textAnchor="middle"
              >
                Embedding
              </text>
            </g>
            <line
              className={`tf-cf__line${oursOnly ? " tf-cf__later" : ""}`}
              x1={310}
              y1={512}
              x2={310}
              y2={486}
              markerEnd="url(#tf-cf-arrow)"
            />
            <g
              className={cls("pos", true)}
              onMouseEnter={enter("pos")}
              onMouseLeave={leave}
            >
              <circle className="tf-cf__plus" cx={310} cy={474} r={10} />
              <text
                className="tf-cf__plussign"
                x={310}
                y={478}
                textAnchor="middle"
              >
                +
              </text>
              <circle className="tf-cf__sine" cx={354} cy={474} r={15} />
              <path
                className="tf-cf__sinewave"
                d="M 342 474 q 6 -12 12 0 t 12 0"
              />
              <line
                className="tf-cf__line"
                x1={322}
                y1={474}
                x2={339}
                y2={474}
              />
              <text className="tf-cf__io" x={398} y={470} textAnchor="middle">
                Positional
              </text>
              <text className="tf-cf__io" x={398} y={483} textAnchor="middle">
                Encoding
              </text>
            </g>
            <g className={oursOnly ? "tf-cf__later" : ""}>
              <line
                className="tf-cf__line"
                x1={310}
                y1={464}
                x2={310}
                y2={428}
              />
              <path
                className="tf-cf__line"
                d="M 310 428 L 290 420 L 290 407"
                markerEnd="url(#tf-cf-arrow)"
              />
              <path
                className="tf-cf__line"
                d="M 310 428 L 310 407"
                markerEnd="url(#tf-cf-arrow)"
              />
              <path
                className="tf-cf__line"
                d="M 310 428 L 330 420 L 330 407"
                markerEnd="url(#tf-cf-arrow)"
              />
            </g>
            <g
              className={cls("masked", true)}
              onMouseEnter={enter("masked")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--mha"
                x={250}
                y={362}
                width={120}
                height={44}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={310}
                y={375}
                textAnchor="middle"
              >
                Masked
              </text>
              <text
                className="tf-cf__label"
                x={310}
                y={388}
                textAnchor="middle"
              >
                Multi-Head
              </text>
              <text
                className="tf-cf__label"
                x={310}
                y={401}
                textAnchor="middle"
              >
                Attention
              </text>
            </g>
            <g className={oursOnly ? "tf-cf__later" : ""}>
              <line
                className="tf-cf__line"
                x1={310}
                y1={362}
                x2={310}
                y2={354}
                markerEnd="url(#tf-cf-arrow)"
              />
              <path
                className="tf-cf__line"
                d="M 310 444 L 382 444 L 382 340 L 372 340"
                markerEnd="url(#tf-cf-arrow)"
              />
            </g>
            <g
              className={cls("addnorm", true)}
              onMouseEnter={enter("addnorm")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--addnorm"
                x={250}
                y={328}
                width={120}
                height={24}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={310}
                y={344}
                textAnchor="middle"
              >
                Add &amp; Norm
              </text>
            </g>
            <g className={oursOnly ? "tf-cf__later" : ""}>
              <line
                className="tf-cf__line"
                x1={310}
                y1={328}
                x2={310}
                y2={315}
                markerEnd="url(#tf-cf-arrow)"
              />
              <path
                className="tf-cf__line"
                d="M 310 322 L 382 322 L 382 248 L 372 248"
                markerEnd="url(#tf-cf-arrow)"
              />
            </g>
            <g
              className={cls("cross", true)}
              onMouseEnter={enter("cross")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--mha"
                x={250}
                y={276}
                width={120}
                height={38}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={310}
                y={292}
                textAnchor="middle"
              >
                Multi-Head
              </text>
              <text
                className="tf-cf__label"
                x={310}
                y={306}
                textAnchor="middle"
              >
                Attention
              </text>
            </g>
            <g className={oursOnly ? "tf-cf__later" : ""}>
              <line
                className="tf-cf__line"
                x1={310}
                y1={276}
                x2={310}
                y2={262}
                markerEnd="url(#tf-cf-arrow)"
              />
            </g>
            <g
              className={cls("addnorm", true)}
              onMouseEnter={enter("addnorm")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--addnorm"
                x={250}
                y={236}
                width={120}
                height={24}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={310}
                y={252}
                textAnchor="middle"
              >
                Add &amp; Norm
              </text>
            </g>
            <g className={oursOnly ? "tf-cf__later" : ""}>
              <line
                className="tf-cf__line"
                x1={310}
                y1={236}
                x2={310}
                y2={216}
                markerEnd="url(#tf-cf-arrow)"
              />
              <path
                className="tf-cf__line"
                d="M 310 226 L 382 226 L 382 148 L 372 148"
                markerEnd="url(#tf-cf-arrow)"
              />
            </g>
            <g
              className={cls("ff", true)}
              onMouseEnter={enter("ff")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--ff"
                x={250}
                y={176}
                width={120}
                height={38}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={310}
                y={192}
                textAnchor="middle"
              >
                Feed
              </text>
              <text
                className="tf-cf__label"
                x={310}
                y={206}
                textAnchor="middle"
              >
                Forward
              </text>
            </g>
            <g className={oursOnly ? "tf-cf__later" : ""}>
              <line
                className="tf-cf__line"
                x1={310}
                y1={176}
                x2={310}
                y2={162}
                markerEnd="url(#tf-cf-arrow)"
              />
            </g>
            <g
              className={cls("addnorm", true)}
              onMouseEnter={enter("addnorm")}
              onMouseLeave={leave}
            >
              <rect
                className="tf-cf__box tf-cf__box--addnorm"
                x={250}
                y={136}
                width={120}
                height={24}
                rx={6}
              />
              <text
                className="tf-cf__label"
                x={310}
                y={152}
                textAnchor="middle"
              >
                Add &amp; Norm
              </text>
            </g>
            <g
              className={cls("out", true)}
              onMouseEnter={enter("out")}
              onMouseLeave={leave}
            >
              <line
                className="tf-cf__line"
                x1={310}
                y1={136}
                x2={310}
                y2={92}
                markerEnd="url(#tf-cf-arrow)"
              />
              <rect
                className="tf-cf__box tf-cf__box--linear"
                x={250}
                y={66}
                width={120}
                height={24}
                rx={6}
              />
              <text className="tf-cf__label" x={310} y={82} textAnchor="middle">
                Linear
              </text>
              <line
                className="tf-cf__line"
                x1={310}
                y1={66}
                x2={310}
                y2={56}
                markerEnd="url(#tf-cf-arrow)"
              />
              <rect
                className="tf-cf__box tf-cf__box--softmax"
                x={250}
                y={30}
                width={120}
                height={24}
                rx={6}
              />
              <text className="tf-cf__label" x={310} y={46} textAnchor="middle">
                Softmax
              </text>
              <line
                className="tf-cf__line"
                x1={310}
                y1={30}
                x2={310}
                y2={20}
                markerEnd="url(#tf-cf-arrow)"
              />
              <text className="tf-cf__io" x={310} y={12} textAnchor="middle">
                Output Probabilities
              </text>
            </g>
          </g>
        </svg>
        <p className="tf-cf__credit">
          Redrawn from Figure 1 of Vaswani et al., “Attention Is All You Need”
          (2017), keeping its layout and colours.
        </p>
      </div>

      <ol className="tf-cf__legend">
        {LEGEND.map((l) => (
          <li
            key={l.id}
            className={`tf-cf__row${active === l.id ? " tf-cf__row--on" : ""}${
              oursOnly && l.later ? " tf-cf__row--later" : ""
            }`}
            onMouseEnter={enter(l.id)}
            onMouseLeave={leave}
          >
            <span
              className={`tf-cf__swatch tf-cf__swatch--${l.swatch}`}
              aria-hidden="true"
            />
            <span className="tf-cf__name">{l.label}</span>
            <span className="tf-cf__here">
              {l.here}{" "}
              {l.link &&
                (l.link.to.startsWith("#") ? (
                  <a href={l.link.to}>{l.link.text}</a>
                ) : (
                  <Link to={l.link.to}>{l.link.text}</Link>
                ))}
              {l.later && (
                <span className="tf-cf__latertag">not built here</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
