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
  /**
   * Overviews are maps rather than lessons: they mostly link onward to the
   * other examples. The gallery groups them above the rest so a student
   * arriving with no context lands on one first.
   */
  kind?: "overview";
  /** Lazy-loaded page component, mounted at /examples/<slug>. */
  Page: LazyExoticComponent<ComponentType>;
}

export const EXAMPLES: ExampleSpec[] = [
  {
    slug: "machine-learning",
    title: "What Is Machine Learning",
    kind: "overview",
    blurb:
      "The shape every problem here shares \u2014 data, features, model, labels, one spreadsheet \u2014 and the single line all the models sit on. Click into the line to reach the rest.",
    tags: ["overview", "orientation", "model choice"],
    Page: lazy(() =>
      import("./overview/MachineLearningPage.js").then((m) => ({
        default: m.MachineLearningPage,
      })),
    ),
  },
  {
    slug: "deep-neural-network",
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
    slug: "activation-function",
    title: "Activation Functions",
    blurb:
      "One neuron adds up its weighted inputs; the activation decides what it sends on. Widen a network with no activation and it stays a straight line — then bend it, and find out why ReLU beat the more neuron-like sigmoid.",
    tags: ["neural networks", "ReLU", "sigmoid", "neuroscience", "interactive"],
    Page: lazy(() =>
      import("./activation/ActivationPage.js").then((m) => ({
        default: m.ActivationPage,
      })),
    ),
  },
  {
    slug: "complex-shapes",
    title: "Fitting Complex Shapes",
    blurb:
      "Build a curve from steps, the way a tree does, or from bends, the way ReLU neurons do. Draw any shape and buy it parameters until the model follows \u2014 then fit a day of noisy traffic and watch the extra parameters chase the noise.",
    tags: ["parameters", "overfitting", "trees", "ReLU", "interactive"],
    Page: lazy(() =>
      import("./complex-shapes/ComplexShapesPage.js").then((m) => ({
        default: m.ComplexShapesPage,
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
    slug: "rnn",
    title: "Recurrent Neural Networks",
    blurb:
      "A network that reads one word at a time and carries what it has read in a single vector \u2014 drawn as a Pac-Man eating a sentence. Open him up, give him a notebook (the LSTM), and find out on a calculator why the plain one forgets.",
    tags: ["neural networks", "RNN", "LSTM", "sequences", "interactive"],
    Page: lazy(() =>
      import("./rnn/RnnPage.js").then((m) => ({
        default: m.RnnPage,
      })),
    ),
  },
  {
    slug: "naive-bayes",
    title: "Naive Bayes",
    blurb:
      "Fit a bell curve per class along each feature by hand, then let naive Bayes fit the same points. Watch what multiplying the curves can and cannot draw.",
    tags: ["classification", "naive Bayes", "probability", "interactive"],
    Page: lazy(() =>
      import("./naive-bayes/NaiveBayesPage.js").then((m) => ({
        default: m.NaiveBayesPage,
      })),
    ),
  },
  {
    slug: "svm",
    title: "Support Vector Machines",
    blurb:
      "Draw a straight line between two classes and leave the widest street you can, then let an SVM find the widest one. See which points hold the line in place.",
    tags: ["classification", "SVM", "margin", "interactive"],
    Page: lazy(() =>
      import("./svm/SvmPage.js").then((m) => ({
        default: m.SvmPage,
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
  {
    slug: "softmax",
    title: "Softmax",
    blurb:
      "Two operations \u2014 exponentiate, then divide \u2014 that turn any set of numbers into something that sums to 1. Drag the logits, break the naive version, and find the temperature knob hiding inside.",
    tags: ["softmax", "probability", "temperature", "interactive"],
    Page: lazy(() =>
      import("./softmax/SoftmaxPage.js").then((m) => ({
        default: m.SoftmaxPage,
      })),
    ),
  },
  {
    slug: "attention",
    title: "Attention",
    blurb:
      "How one word reads another. A sentence, the n \u00d7 n grid its vectors produce, and a softmax toggle on the grid itself \u2014 queries, keys, values, and the quadratic cost you can watch grow.",
    tags: ["transformers", "attention", "Q/K/V", "interactive"],
    Page: lazy(() =>
      import("./attention/AttentionPage.js").then((m) => ({
        default: m.AttentionPage,
      })),
    ),
  },
  {
    slug: "transformers",
    title: "Transformers",
    blurb:
      "The attention head as a finished part. Run several at once, add what they find back onto each word, pass every word through a memory where the facts live, stack it dozens of times \u2014 then decode the famous diagram box by box.",
    tags: ["transformers", "multi-head attention", "fully connected layers", "architecture", "interactive"],
    Page: lazy(() =>
      import("./transformers/TransformersPage.js").then((m) => ({
        default: m.TransformersPage,
      })),
    ),
  },
  {
    slug: "language-models",
    title: "Large Language Models",
    blurb:
      "From a Markov chain of words to a language model: tokens in, one token out, one pass per word. Then many transformer blocks in series, drawn at the real shapes of 2026's open models.",
    tags: ["Markov chains", "tokenizers", "transformers", "LLMs", "scale", "interactive"],
    Page: lazy(() =>
      import("./language-models/LanguageModelsPage.js").then((m) => ({
        default: m.LanguageModelsPage,
      })),
    ),
  },
  {
    slug: "bert",
    title: "BERT",
    blurb:
      "What happens when the transformer block is stacked and trained to fill in blanks: a word stops having one vector and gets one per sentence it appears in. Short, and built on the two examples before it.",
    tags: ["transformers", "BERT", "contextual embeddings", "pre-training"],
    Page: lazy(() =>
      import("./bert/BertPage.js").then((m) => ({
        default: m.BertPage,
      })),
    ),
  },
  {
    slug: "word2vec",
    title: "Word Embeddings",
    blurb:
      "Train a network on a task nobody cares about \u2014 guessing which words appear near which \u2014 then throw away the half that does the guessing. What is left is meaning as a list of numbers. Ends on the words the table never saw, and how spelling gets them back.",
    tags: ["embeddings", "word2vec", "subword", "fastText", "NLP", "interactive"],
    Page: lazy(() =>
      import("./word2vec/Word2VecPage.js").then((m) => ({
        default: m.Word2VecPage,
      })),
    ),
  },
  {
    slug: "training",
    title: "Training",
    blurb:
      "The only model here that arrives knowing nothing. Watch 6,500 parameters start as pure noise and become a network that reproduces a handwritten digit \u2014 trained live in your browser, one step at a time.",
    tags: ["training", "gradient descent", "autoencoder", "interactive"],
    Page: lazy(() =>
      import("./training/TrainingPage.js").then((m) => ({
        default: m.TrainingPage,
      })),
    ),
  },
  {
    slug: "parameter-budget",
    title: "Counting Parameters",
    blurb:
      "From a three-number linear regression through ResNet to trillion-parameter language models, counted from each one\u2019s shape. Then shrink a real network by rounding its numbers, and see how a small model copies a big one.",
    tags: ["parameters", "architecture", "scale", "quantization", "distillation", "interactive"],
    Page: lazy(() =>
      import("./parameter-budget/ParameterBudgetPage.js").then((m) => ({
        default: m.ParameterBudgetPage,
      })),
    ),
  },
  {
    slug: "wiring",
    title: "Breadboards and Loops",
    blurb:
      "Wire a real breadboard: see the connections it hides, light an LED, burn one out, chase a short the long way round, and flip a digital pin by hand. A run of small puzzles, then free play.",
    tags: ["circuits", "breadboard", "microcontrollers", "interactive"],
    Page: lazy(() =>
      import("./wiring/WiringPage.js").then((m) => ({
        default: m.WiringPage,
      })),
    ),
  },
  {
    slug: "code",
    title: "Reading a Sketch",
    blurb:
      "Watch a microcontroller sketch run line by line on a live board: setup once, loop forever, every line coloured by its job, numbers you can drag, and threads from each pin number to its pin. Then hunt real beginner bugs, multiplex two displays and teach a tiny classifier.",
    tags: ["microcontrollers", "code", "Arduino", "interactive"],
    Page: lazy(() =>
      import("./code/CodePage.js").then((m) => ({
        default: m.CodePage,
      })),
    ),
  },
];

export function findExample(slug: string): ExampleSpec | undefined {
  return EXAMPLES.find((e) => e.slug === slug);
}
