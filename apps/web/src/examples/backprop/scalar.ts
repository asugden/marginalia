// A scalar that remembers how it was made, after micrograd.
//
// Every number on the backpropagation page is one of these. Each records its
// value, the scalars it was computed from, the operation that combined them,
// and how to hand a gradient back to them (its local derivative times the
// gradient arriving from downstream: the chain rule). `backward()` orders the
// graph so every scalar is finished before the ones that fed it, seeds the
// output with gradient 1, and runs each local step in turn.
//
// Gradients ACCUMULATE (+=): a scalar used in two places gets a contribution
// from each. That is the whole reason a hidden neuron's gradient is a sum
// over every neuron it feeds.

export type Op = "" | "+" | "*" | "tanh" | "relu" | "**2";

export class Scalar {
  val: number;
  grad = 0;
  label: string;
  readonly inputs: Scalar[];
  readonly op: Op;
  backStep: () => void = () => {};

  constructor(val: number, label = "", inputs: Scalar[] = [], op: Op = "") {
    this.val = val;
    this.label = label;
    this.inputs = inputs;
    this.op = op;
  }

  add(other: Scalar | number, label = ""): Scalar {
    const o = typeof other === "number" ? new Scalar(other) : other;
    const out = new Scalar(this.val + o.val, label, [this, o], "+");
    out.backStep = () => {
      this.grad += 1 * out.grad;
      o.grad += 1 * out.grad;
    };
    return out;
  }

  mul(other: Scalar | number, label = ""): Scalar {
    const o = typeof other === "number" ? new Scalar(other) : other;
    const out = new Scalar(this.val * o.val, label, [this, o], "*");
    out.backStep = () => {
      this.grad += o.val * out.grad;
      o.grad += this.val * out.grad;
    };
    return out;
  }

  sub(other: Scalar | number, label = ""): Scalar {
    const o = typeof other === "number" ? new Scalar(other) : other;
    return this.add(o.mul(-1), label);
  }

  square(label = ""): Scalar {
    const out = new Scalar(this.val ** 2, label, [this], "**2");
    out.backStep = () => {
      this.grad += 2 * this.val * out.grad;
    };
    return out;
  }

  tanh(label = ""): Scalar {
    const t = Math.tanh(this.val);
    const out = new Scalar(t, label, [this], "tanh");
    out.backStep = () => {
      this.grad += (1 - t * t) * out.grad;
    };
    return out;
  }

  relu(label = ""): Scalar {
    const out = new Scalar(this.val > 0 ? this.val : 0, label, [this], "relu");
    out.backStep = () => {
      this.grad += (this.val > 0 ? 1 : 0) * out.grad;
    };
    return out;
  }

  /** Every scalar this one depends on, inputs before the things they feed. */
  ordered(): Scalar[] {
    const order: Scalar[] = [];
    const seen = new Set<Scalar>();
    const visit = (v: Scalar) => {
      if (seen.has(v)) return;
      seen.add(v);
      for (const i of v.inputs) visit(i);
      order.push(v);
    };
    visit(this);
    return order;
  }

  /** Zero every gradient, seed this one with 1, and run the chain rule. */
  backward(): void {
    const order = this.ordered();
    for (const v of order) v.grad = 0;
    this.grad = 1;
    for (let i = order.length - 1; i >= 0; i--) order[i]!.backStep();
  }
}

/** Deterministic random numbers, so every reader sees the same network. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One neuron: weights, a bias, and the scalars a forward pass made. */
export interface NeuronRun {
  w: Scalar[];
  b: Scalar;
  /** The weighted sum plus bias, before the activation. */
  n: Scalar;
  /** The neuron's output: relu(n) in a hidden layer, n itself at the
   *  output (a plain output can reach any target, negative ones included). */
  o: Scalar;
}

/** The parameters of a fully connected network (ReLU hidden layers, a plain
 *  output), as plain numbers. */
export interface Params {
  sizes: number[];
  /** layers[l][j] = { w: weights from layer l's inputs, b } */
  layers: { w: number[]; b: number }[][];
}

/** Weights and biases drawn uniformly from −1..1, as the reference code does. */
export function initParams(sizes: number[], seed: number): Params {
  const r = seeded(seed);
  const u = () => r() * 2 - 1;
  const layers = sizes.slice(1).map((nOut, l) =>
    Array.from({ length: nOut }, () => ({
      w: Array.from({ length: sizes[l]! }, u),
      b: u(),
    })),
  );
  return { sizes, layers };
}

/** A forward pass for one example, loss (y − target)², and the backward
 *  pass. Returns every scalar the page draws. */
export function runNetwork(p: Params, x: number[], target: number) {
  let acts: Scalar[] = x.map((v, i) => new Scalar(v, `x${i + 1}`));
  const inputs = acts;
  const layers: NeuronRun[][] = p.layers.map((layer, l) => {
    const run = layer.map((nr) => {
      const w = nr.w.map((v) => new Scalar(v));
      const b = new Scalar(nr.b);
      let sum: Scalar = b;
      w.forEach((wi, i) => {
        sum = sum.add(wi.mul(acts[i]!));
      });
      const o = l < p.layers.length - 1 ? sum.relu() : sum;
      return { w, b, n: sum, o };
    });
    acts = run.map((r) => r.o);
    return run;
  });
  const y = acts[0]!;
  const diff = y.sub(target);
  const loss = diff.square();
  loss.backward();
  return { inputs, layers, y, loss };
}

/** One step downhill: every parameter moves by −rate × its gradient. */
export function step(p: Params, run: ReturnType<typeof runNetwork>, rate: number): Params {
  return {
    sizes: p.sizes,
    layers: p.layers.map((layer, l) =>
      layer.map((nr, j) => {
        const r = run.layers[l]![j]!;
        return {
          w: nr.w.map((v, i) => v - rate * r.w[i]!.grad),
          b: nr.b - rate * r.b.grad,
        };
      }),
    ),
  };
}

/** Gradients for every parameter, laid out like Params. */
export type Grads = { w: number[]; b: number }[][];

/** One training step over every example, as the reference `sgd` does:
 *  forward on all examples, add their errors, backpropagate, step.
 *
 *  `carried` is the gradient left over from the previous step. Zeroing (the
 *  correct thing) means passing null; forgetting to zero means passing the
 *  last step's total, which this step then adds to with +=. */
export function trainStep(
  p: Params,
  data: number[][],
  targets: number[],
  rate: number,
  carried: Grads | null,
) {
  const runs = data.map((x, i) => runNetwork(p, x, targets[i]!));
  const loss = runs.reduce((s, r) => s + r.loss.val, 0);
  const grads: Grads = p.layers.map((layer, l) =>
    layer.map((nr, j) => ({
      w: nr.w.map(
        (_, i) =>
          (carried?.[l]![j]!.w[i] ?? 0) +
          runs.reduce((s, r) => s + r.layers[l]![j]!.w[i]!.grad, 0),
      ),
      b:
        (carried?.[l]![j]!.b ?? 0) +
        runs.reduce((s, r) => s + r.layers[l]![j]!.b.grad, 0),
    })),
  );
  const next: Params = {
    sizes: p.sizes,
    layers: p.layers.map((layer, l) =>
      layer.map((nr, j) => ({
        w: nr.w.map((v, i) => v - rate * grads[l]![j]!.w[i]!),
        b: nr.b - rate * grads[l]![j]!.b,
      })),
    ),
  };
  return { loss, predictions: runs.map((r) => r.y.val), grads, next };
}
