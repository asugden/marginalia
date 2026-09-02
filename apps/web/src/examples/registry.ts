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
  /** Lazy-loaded page component, mounted at /examples/<slug>. */
  Page: LazyExoticComponent<ComponentType>;
}

export const EXAMPLES: ExampleSpec[] = [
  {
    slug: "digit-recognizer",
    title: "Deep Neural Network",
    blurb:
      "Draw a digit and watch a real neural network classify it — every neuron and connection shown live as the signal flows from your drawing to a prediction.",
    tags: ["neural networks", "MNIST", "interactive"],
    Page: lazy(() =>
      import("./mnist-mlp/DigitRecognizerPage.js").then((m) => ({
        default: m.DigitRecognizerPage,
      })),
    ),
  },
  {
    slug: "cnn-digit-recognizer",
    title: "Convolutional Neural Network",
    blurb:
      "The same drawing, read by a convolutional network. Watch 3×3 kernels slide over the image into feature maps — and click a kernel to see the convolution arithmetic step by step.",
    tags: ["neural networks", "CNN", "convolution", "interactive"],
    Page: lazy(() =>
      import("./mnist-cnn/CNNDigitRecognizerPage.js").then((m) => ({
        default: m.CNNDigitRecognizerPage,
      })),
    ),
  },
  {
    slug: "naive-bayes",
    title: "Naive Bayes",
    blurb:
      "Drag a decision boundary through overlapping distributions, then let naive Bayes fit the same points. Two scores \u2014 yours and the model's \u2014 and the gap between them is the lesson.",
    tags: ["classification", "naive Bayes", "probability", "interactive"],
    Page: lazy(() =>
      import("./naive-bayes/NaiveBayesPage.js").then((m) => ({
        default: m.NaiveBayesPage,
      })),
    ),
  },
  {
    slug: "decision-tree",
    title: "Decision Tree Classifiers",
    blurb:
      "Twelve steps through the algorithm, each changing one thing. Score every candidate split, watch the winner change from branch to branch, and see where greedy growing goes wrong.",
    tags: ["decision trees", "CART", "lesson", "interactive"],
    Page: lazy(() =>
      import("./decision-tree/DecisionTreePage.js").then((m) => ({
        default: m.DecisionTreePage,
      })),
    ),
  },
  {
    slug: "random-forest",
    title: "Random Forest",
    blurb:
      "Reveal a forest one tree at a time. Watch where the trees agree and where they argue, dog by dog, and how the vote lands better than any single tree.",
    tags: ["ensembles", "random forest", "bagging", "interactive"],
    Page: lazy(() =>
      import("./random-forest/RandomForestPage.js").then((m) => ({
        default: m.RandomForestPage,
      })),
    ),
  },
  {
    slug: "gradient-boosting",
    title: "XGBoost",
    blurb:
      "The same trees stacked top to bottom instead of side by side. Each round is fitted to the last round's mistakes, so the order is the model \u2014 watch the residuals shrink, then watch it overfit.",
    tags: ["ensembles", "boosting", "XGBoost", "interactive"],
    Page: lazy(() =>
      import("./xgboost/XGBoostPage.js").then((m) => ({
        default: m.XGBoostPage,
      })),
    ),
  },
];

export function findExample(slug: string): ExampleSpec | undefined {
  return EXAMPLES.find((e) => e.slug === slug);
}
