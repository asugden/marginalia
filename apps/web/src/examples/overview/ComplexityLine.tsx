// The complexity line, advanced by scrolling rather than by pressing buttons.
//
// The section pins itself to the viewport and consumes a stretch of scroll: the
// line stays put while information accumulates on it, then releases and the
// page moves on. Reading it is the same gesture as reading the rest of the page,
// so nothing has to be discovered.
//
//   step 0   the axis, the arrow, the open/black box divide
//   step 1   + the four families
//   step 2   + the models under each
//   step 3   + the sizing panel, layered ON TOP of the line
//
// Everything clickable is inside the diagram — family labels and model names
// are the links. There are no navigation buttons, and the interpretability
// claim is made by the divide and the typography, not by a paragraph.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AXIS_QUANTITIES, FAMILIES, OPEN_BOX_EDGE, ROW_FLOOR, classify } from "./taxonomy.js";

/** Number of revealed states, including the bare line. */
const STEPS = 4;
/** Viewport heights of scroll the pinned section consumes. */
const SCROLL_VH = 3.2;

/** Geometry of the drawn axis, in SVG user units. */
const VB_W = 1000;
const VB_H = 132;
const X0 = 40;
const X1 = 952;
const Y = 84;

const xFor = (pos: number) => X0 + pos * (X1 - X0);
const pctFor = (pos: number) => (xFor(pos) / VB_W) * 100;

export function ComplexityLine() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  // Shared by the marker (which rides the axis) and the panel (which is fixed
  // to the pinned viewport), so they are two views of one value.
  const [features, setFeatures] = useState(12);
  const [rows, setRows] = useState(800);

  // Map scroll position within the tall section onto a step index. Reading
  // scroll position directly (rather than wiring wheel events) keeps trackpads,
  // mouse wheels, touch drags, and keyboard paging all working unchanged.
  //
  // The app shell scrolls inside `.app__body`, not the window — that element
  // owns `overflow-y: auto`, which is also what `position: sticky` resolves
  // against. So both the listener and the viewport height must come from that
  // scroller, not from `window`; using window here silently never fires.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const scroller = nearestScroller(el);
    const viewportH = () =>
      scroller === document.scrollingElement || scroller === document.body
        ? window.innerHeight
        : (scroller as HTMLElement).clientHeight;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = viewportH();
      const travel = rect.height - vh;
      if (travel <= 0) {
        setStep(STEPS - 1);
        setProgress(1);
        return;
      }
      // How far the section's top has travelled past the scroller's top edge.
      const top =
        scroller instanceof HTMLElement && scroller !== document.body
          ? rect.top - scroller.getBoundingClientRect().top
          : rect.top;
      const p = Math.min(1, Math.max(0, -top / travel));
      setProgress(p);
      // Hold the last step through the tail of the travel so the sizing panel
      // is readable before the section releases.
      setStep(Math.min(STEPS - 1, Math.floor(p * STEPS * 1.08)));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const target: EventTarget = scroller === document.scrollingElement ? window : scroller;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      className="ovw-scroll"
      ref={sectionRef}
      style={{ height: `calc(100vh + ${SCROLL_VH * 100}vh)` }}
    >
      <div className={`ovw-pin at-${step}`}>
        {/* The stage holds a minimum width; on a narrow screen this track
            scrolls sideways rather than letting the labels collide. */}
        <div className="ovw-pin__track">
        <div className="ovw-stage">
          {/* What grows to the right, sitting ABOVE the arrowhead. */}
          <ul className="ovw-quantities" aria-label="Increases to the right">
            {AXIS_QUANTITIES.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>

          <svg
            className="ovw-axis"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            role="img"
            aria-label="Models arranged by complexity, from linear regression at the simple end to large language models at the complex end."
          >
            <defs>
              {/* The black-box field fades out to the right: the loss of
                  interpretability is a gradient, not a cliff, and a hard-edged
                  block would claim otherwise. */}
              <linearGradient id="ovw-closed-field" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" className="ovw-stop-closed-0" />
                <stop offset="100%" className="ovw-stop-closed-1" />
              </linearGradient>
            </defs>

            {/* Interpretability as a BACKGROUND, not a sentence. Left of the
                divide is clear paper; right of it the field darkens. */}
            <rect
              x={X0 - 18}
              y={Y - 46}
              width={xFor(OPEN_BOX_EDGE) - X0 + 18}
              height={92}
              className="ovw-field ovw-field--open"
            />
            <rect
              x={xFor(OPEN_BOX_EDGE)}
              y={Y - 46}
              width={X1 - xFor(OPEN_BOX_EDGE) + 18}
              height={92}
              className="ovw-field ovw-field--closed"
            />

            <text
              x={xFor(OPEN_BOX_EDGE) - 16}
              y={Y - 28}
              textAnchor="end"
              className="ovw-axis__box ovw-axis__box--open"
            >
              open box
            </text>
            <text
              x={xFor(OPEN_BOX_EDGE) + 16}
              y={Y - 28}
              textAnchor="start"
              className="ovw-axis__box ovw-axis__box--closed"
            >
              black box
            </text>

            <line
              x1={xFor(OPEN_BOX_EDGE)}
              y1={Y - 46}
              x2={xFor(OPEN_BOX_EDGE)}
              y2={Y + 46}
              className="ovw-axis__divide"
            />

            <circle cx={X0} cy={Y} r="6" className="ovw-axis__dot" />
            <line x1={X0} y1={Y} x2={X1 - 14} y2={Y} className="ovw-axis__line" />
            <path
              d={`M ${X1 - 24} ${Y - 12} L ${X1} ${Y} L ${X1 - 24} ${Y + 12} Z`}
              className="ovw-axis__head"
            />

            {FAMILIES.map((f) => (
              <line
                key={f.id}
                x1={xFor(f.pos)}
                y1={Y - 11}
                x2={xFor(f.pos)}
                y2={Y + 11}
                className="ovw-axis__tick"
              />
            ))}
          </svg>

          {/* Family + model labels are HTML so the browser measures and wraps
              them; SVG text collides at this density. They share the axis's
              percentage coordinates. */}
          <div className="ovw-cols">
            {FAMILIES.map((f) => (
              <div
                key={f.id}
                className={`ovw-col ovw-col--grows-${f.lean}`}
                style={{ left: `${pctFor(f.pos)}%` }}
              >
                <span className="ovw-col__fam">
                  {f.slug ? (
                    <Link to={`/examples/${f.slug}`} tabIndex={step >= 1 ? 0 : -1}>
                      {f.label}
                    </Link>
                  ) : (
                    f.label
                  )}
                </span>
                <ul className="ovw-col__models">
                  {f.models.map((m) => (
                    <li key={m.name}>
                      {m.slug ? (
                        <Link to={`/examples/${m.slug}`} tabIndex={step >= 2 ? 0 : -1}>
                          {m.name}
                        </Link>
                      ) : (
                        m.name
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Layered on top of the line, not placed after it. */}
          <SizingMarker active={step >= 3} features={features} />
        </div>
        </div>

        <SizingPanel
          active={step >= 3}
          features={features}
          rows={rows}
          onFeatures={setFeatures}
          onRows={setRows}
        />

        {/* How far through the pinned section we are. */}
        <div className="ovw-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>
    </div>
  );
}

function SizingMarker({ active, features }: { active: boolean; features: number }) {
  const { family } = useMemo(() => classify(features, 0), [features]);
  return (
    <span
      className={`ovw-marker${active ? " is-on" : ""}`}
      style={{ left: `${pctFor(family.pos)}%` }}
      aria-hidden={!active}
    >
      <em>you are here</em>
      {/* The stem is what makes this a pointer rather than a floating label:
          it runs from the pill down to the axis stroke itself. */}
      <i className="ovw-marker__stem" />
    </span>
  );
}

/**
 * Log-scale positions for the two sliders. Both quantities span several orders
 * of magnitude and the interesting range sits at the bottom — on a linear
 * track, everything from 1 to 100 features would be crushed into the first tenth
 * of the slider and undraggable.
 */
const FEATURE_RANGE = { min: 1, max: 1000 };
const ROW_RANGE = { min: 10, max: 1000000 };

const toLog = (v: number, r: { min: number; max: number }) =>
  ((Math.log(clamp(v, r.min, r.max)) - Math.log(r.min)) /
    (Math.log(r.max) - Math.log(r.min))) *
  1000;
const fromLog = (p: number, r: { min: number; max: number }) =>
  Math.round(Math.exp(Math.log(r.min) + (p / 1000) * (Math.log(r.max) - Math.log(r.min))));

function SizingPanel({
  active,
  features,
  rows,
  onFeatures,
  onRows,
}: {
  active: boolean;
  features: number;
  rows: number;
  onFeatures: (n: number) => void;
  onRows: (n: number) => void;
}) {
  const { band, family, neededRows, starved } = useMemo(
    () => classify(features, rows),
    [features, rows],
  );

  return (
    <div className={`ovw-sizing__panel${active ? " is-on" : ""}`} aria-hidden={!active}>
      <div className="ovw-sizing__fields">
        <Field
          label="features"
          value={features}
          range={FEATURE_RANGE}
          tabbable={active}
          onChange={onFeatures}
        />
        <Field
          label="rows"
          value={rows}
          range={ROW_RANGE}
          tabbable={active}
          onChange={onRows}
        />
      </div>

      <p className={`ovw-sizing__verdict${starved ? " is-warn" : ""}`}>
        {band.verdict}
      </p>

      <p className="ovw-sizing__floor">
        {family.label} wants about{" "}
        <b>{neededRows.toLocaleString()}+ rows</b>
        {starved ? (
          <span className="ovw-sizing__short">
            — you have {rows.toLocaleString()}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  range,
  tabbable,
  onChange,
}: {
  label: string;
  value: number;
  range: { min: number; max: number };
  tabbable: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <label className="ovw-field">
      <span className="ovw-field__label">{label}</span>
      <input
        className="ovw-field__num"
        type="number"
        min={range.min}
        max={range.max}
        value={value}
        tabIndex={tabbable ? 0 : -1}
        onChange={(e) => onChange(clamp(Number(e.target.value), range.min, range.max))}
      />
      <input
        className="ovw-field__slider"
        type="range"
        min={0}
        max={1000}
        step={1}
        value={toLog(value, range)}
        tabIndex={tabbable ? 0 : -1}
        aria-label={label}
        onChange={(e) => onChange(fromLog(Number(e.target.value), range))}
      />
    </label>
  );
}

/**
 * The nearest ancestor that actually scrolls. The shell puts `overflow-y: auto`
 * on `.app__body`, so that — not the window — is what sticky and scroll events
 * are relative to.
 */
function nearestScroller(el: HTMLElement): Element {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement ?? document.body;
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
