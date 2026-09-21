// The shape of every supervised learning problem, drawn the way it goes on a
// whiteboard: data sits ABOVE the line, an elbow drops from it into the row,
// and features -> model -> labels runs left to right.
//
// This is a diagram, not a control panel. Nothing here is clickable.
//
// `model` is drawn bigger and with square corners: it is the only box in the
// row that is a thing you *choose* rather than a column of a spreadsheet.
//
// Off the right-hand end, `labels` forks into what an answer can be. Each fork
// gets its own arrow, and categorization is indented to the RIGHT of (i.e.
// downstream of) classification, because a category is what you get from asking
// the yes/no question about many classes at once — it sits inside
// classification, not beside it.

import { useEffect, useRef } from "react";

interface Kind {
  id: string;
  name: string;
  shape: string;
  example: string;
  /** Downstream of classification rather than a peer of it. */
  nested?: boolean;
}

const LABEL_KINDS: Kind[] = [
  {
    id: "classification",
    name: "classification",
    shape: "true / false · yes / no · a probability",
    example: "will someone click on this ad",
  },
  {
    id: "categorization",
    name: "categorization",
    shape: "one of several categories",
    example: "what kind of song is this",
    nested: true,
  },
  {
    id: "regression",
    name: "regression",
    shape: "a number",
    example: "how many seconds you'll stay on the website",
  },
];

export function PipelineFigure() {
  // The fork list has to line up under the `labels` box, whose x position
  // depends on how wide the three boxes and two arrows render. Measuring it is
  // more robust than hard-coding an offset that drifts with the font.
  const labelsRef = useRef<HTMLSpanElement>(null);
  const figRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sync = () => {
      const box = labelsRef.current;
      const fig = figRef.current;
      if (!box || !fig) return;
      const x = box.getBoundingClientRect().left - fig.getBoundingClientRect().left;
      fig.style.setProperty("--ovw-labels-x", `${Math.max(0, x)}px`);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return (
    <figure className="ovw-fig" ref={figRef}>
      <div className="ovw-pipeline">
        {/* data, above the row, with an elbow dropping into it. */}
        <div className="ovw-pipeline__data">
          <span className="ovw-cost">&gt; 50% of the cost</span>
          <span className="ovw-box ovw-box--data">data</span>
        </div>

        <svg className="ovw-elbow" viewBox="0 0 92 80" aria-hidden="true">
          <path
            d="M 20 4 L 20 56 L 70 56"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 62 50 L 72 56 L 62 62"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="ovw-pipeline__row">
          <span className="ovw-box">features</span>
          <Arrow />
          <span className="ovw-box ovw-box--model">model</span>
          <Arrow />
          <span className="ovw-box ovw-box--labels" ref={labelsRef}>
            labels
          </span>
        </div>
      </div>

      {/* What an answer can be. Each kind is introduced by its own arrow. */}
      <ul className="ovw-kinds">
        {LABEL_KINDS.map((k) => (
          <li key={k.id} className={`ovw-kind${k.nested ? " is-nested" : ""}`}>
            <Arrow className="ovw-kind__arrow" />
            <span className="ovw-kind__body">
              <span className="ovw-kind__name">{k.name}</span>
              <span className="ovw-kind__shape">{k.shape}</span>
              <span className="ovw-kind__eg">{k.example}</span>
            </span>
          </li>
        ))}
      </ul>

      <figcaption className="ovw-sr">
        Data feeds into features; features feed a model; the model produces
        labels. A label is either a classification — true/false, yes/no, or a
        probability, and downstream of that a category — or a regression, a
        number.
      </figcaption>
    </figure>
  );
}

function Arrow({ className = "ovw-arrow" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 20" aria-hidden="true">
      <path d="M 4 10 L 36 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M 29 4 L 38 10 L 29 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
