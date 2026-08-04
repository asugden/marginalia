// The examples registry.
//
// An "example" is a self-contained, static, interactive teaching page — no
// backend, no course data, no auth. It differs from a *module* (attendance,
// provenance): a module is a feature wired into courses and the data model; an
// example is a standalone illustration an instructor can point students at.
// Examples are meant to be near-identical for every viewer (the same
// visualization, the same trained model), though an example may expose small
// knobs to tune what it shows.
//
// Adding an example = adding one entry here + a lazy-loaded page component and
// a route in main.tsx. The index page (`/examples`) renders this list, and
// instructors can link any example into their course material by its URL.

import { lazy, type LazyExoticComponent, type ComponentType } from "react";

export interface ExampleSpec {
  /** URL slug under /examples/<slug>. Stable — it's what instructors link to. */
  slug: string;
  /** Card title. */
  title: string;
  /** One-line description for the index card. */
  blurb: string;
  /** Short topic tags for the card. */
  tags: string[];
  /** A tiny emoji/glyph for the card (kept dependency-free). */
  glyph: string;
  /** Lazy-loaded page component, mounted at /examples/<slug>. */
  Page: LazyExoticComponent<ComponentType>;
}

export const EXAMPLES: ExampleSpec[] = [
  {
    slug: "digit-recognizer",
    title: "Digit recognizer",
    blurb:
      "Draw a digit and watch a real neural network classify it — every neuron and connection shown live as the signal flows from your drawing to a prediction.",
    tags: ["neural networks", "MNIST", "interactive"],
    glyph: "✍️",
    Page: lazy(() =>
      import("./mnist-mlp/DigitRecognizerPage.js").then((m) => ({
        default: m.DigitRecognizerPage,
      })),
    ),
  },
];

export function findExample(slug: string): ExampleSpec | undefined {
  return EXAMPLES.find((e) => e.slug === slug);
}
