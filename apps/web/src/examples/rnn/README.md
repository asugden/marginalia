# Example: Recurrent Neural Networks

A standalone, static, interactive page about networks that read one word at a
time. Mounted at `/examples/rnn`. No backend, no auth — it loads two tiny
trained models as a static JSON asset and computes every state, gate, verdict
and gradient factor in the browser.

## Where it sits

Everything before it in the gallery was handed its whole input at once. This
page is the first sequence model: what it costs to read left to right carrying
a single vector, and why that design lost to attention. It links back to the
[deep neural network](../mnist-mlp/README.md) (the layer inside), to
[word embeddings](../word2vec/README.md) (the input), and forward to
[attention](../attention/README.md) (every word sees every word). The
[BERT](../bert/README.md) page points here for ELMo, the last contextual
embedding built on this design.

## The arc

1. **One word at a time — Pac-Man.** The sentence is a corridor of pellets
   and the network eats them in order. He cannot see behind him; what he has
   eaten is gone. What he carries is one vector, redrawn above his head after
   every word, with the model's verdict-so-far as a small meter under it. Step
   through or play; type a sentence from the 63-word vocabulary. The readout
   names where the verdict last flipped and which words the flag then survived.

2. **What is inside him.** One dense layer. Left, rolled up: a box with a loop.
   Right, unrolled: the same box once per word, each copy's state handed to the
   next, with the two weight matrices drawn as swatches inside every copy —
   identical, so weight sharing is something the eye checks rather than a
   sentence in a paragraph. The chain is as deep as the sentence is long.

3. **Give him a notebook: the LSTM.** Same corridor, three strips: the keep
   gate (one dial per notebook line, shaded 0 → 1), the notebook (cell state)
   and what he says (hidden state). The line the network keeps longest is
   outlined. Then the classic experiment: both models above were trained on
   negations 0–6 words before the adjective and both carry the flag out to 24;
   train each again only on negations 12–20 words away and the plain network
   never learns to use them while the LSTM does. Drag the gap; the verdicts are
   live, the loss curves are the trainer's, the accuracy is measured offline.

4. **Why: a calculator.** Press × 0.1 twenty times. Then the same
   multiplication measured on the networks: for the plain network the exact
   backward pass from the verdict to each earlier state, one factor per step,
   with the running product drawn as "signal left"; for the LSTM the keep gate
   on the notebook line, which is a multiplier the network sets directly and
   can set to 1. Switch between before training, after near training, and
   after far training. Factors above 1 are flagged — the exploding side — and
   the trainer's clip is named.

5. **Lights off.** The sentence ends and the corridor goes dark; keep walking
   and the loop keeps turning on zero input — real states of the trained
   network, which drift and then settle. A forward reference: a loop producing
   states with nothing coming in is what a sleeping brain does when it replays
   the day, and a later example on dreams picks this figure up.

## What is real here

**Real:** both networks, all four trainings, and the untrained starting
weights. Every state, gate, readout, gradient factor and running product on
the page is computed live by `rnn.ts` from `weights.json`. The loss curves and
the accuracy-by-gap table are the trainer's own output, stored in the asset's
`meta`. The far-negation result — plain network never learns, LSTM learns in
a few hundred steps — is measured, not staged.

**Synthetic:** the training sentences. They are drawn from templates over a
63-word vocabulary (things, verbs, three negations, intensifiers, neutral
filler phrases, seven good and seven bad adjectives). The page says so in its
footer and in the far-experiment panel.

**A design choice worth knowing:** negation appears in 35% of training
sentences, not 50%. At exactly half the label is a pure XOR of "was there a
negation" and "is the adjective positive", no single word carries any signal on
its own, and a plain tanh network sits at a flat point and never starts. The
trainer explains this in a comment; the page does not mention it.

Measured on the shipped weights, for the default sentence:

```
plain, before training   factors per step ≈ 0.43–0.83, ~0.55 typical
plain, trained near      factors 0.07–2.25 (some above 1: the network learned to hold)
plain, trained far       factors 0.04–0.75, never learned negation
LSTM keep gate, init     ≈ 0.73 (forget bias +1)
LSTM keep gate, trained  runs to ~0.9 on the kept line
```

## Architecture

- `rnn.ts` — model loading, tokenizer, both forward passes with every
  intermediate, the readout, the exact backward factors for the plain network,
  and the deterministic filler generator that stretches the gap.
- `Corridor.tsx` — the Pac-Man corridor and its pieces (vector strip, gate
  strip, verdict meter, Pac-Man, track), reused by three panels.
- `InsidePanel.tsx` — the rolled loop and the unrolled chain.
- `LstmPanel.tsx` — the LSTM corridor and the far-negation experiment.
- `GradientPanel.tsx` — the calculator and the measured factor chains.
- `DreamPanel.tsx` — lights off.
- `RnnPage.tsx` — the page, the sentence picker, and the first corridor.
- `rnn.css` — styles beyond the attention and transformer stylesheets.
- `weights.json` — four trained models plus two untrained ones, the report and
  the curves (~54 KB). Also copied to `public/examples/rnn/`.
- `train/train.mjs` — the offline trainer.

## Regenerating the weights

```
node apps/web/src/examples/rnn/train/train.mjs
cp apps/web/src/examples/rnn/weights.json apps/web/public/examples/rnn/weights.json
```

Pure Node, no dependencies, about fifteen seconds. Deterministic (fixed PRNG
seed). The trainer prints the accuracy-by-gap table and the verdicts on the
page's preset sentences — read both before shipping if anything in the
templates or the config changes.
