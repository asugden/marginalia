# Example: BERT

A short, standalone page at `/examples/bert`. It reuses the transformers
example's block and asset (`/examples/transformers/heads.json`) and adds no
model of its own. Its job is to show what the block is *for* once it is
stacked and trained: a word stops having one vector and gets one per sentence.

## Why it is short, and what it does not redo

The transformers example already builds the block — heads, `W_O`, add &
norm, the memory, stacking — and the word-embeddings example already builds
the idea of a word as a vector. This page assumes both and links back rather
than repeating. It also leaves generation, masking-as-in-causal-attention,
and next-word prediction to the language-models example. What is left is the
part that is BERT's own:

1. **One vector per word, or one per use?** Pick a word that appears in more
   than one of the four sentences ("the", "a"). Three strips per sentence:
   the embedding (identical every time — that is what a lookup table means),
   what the word took from its context (visibly different per sentence), and
   the word after one block (mostly itself, no longer identical). The
   readout gives the least-similar pair for both. Honest about magnitude:
   one legibility-fitted block moves a word a few percent; BERT stacks
   twelve or twenty-four and the differences compound. The panel ends by
   naming the idea — contextual embeddings — and unpacking the acronym.

2. **Fill in the blank, from both sides.** Click any word to hide it. Arcs
   from every other word converge on the blank, colour-coded left and right,
   with a count of how many words each side contributes; a left-to-right
   model would have only the left. This is masked-language-model
   pre-training: no labels, one word in seven hidden, a few billion times.
   **No guesses are shown.** The block was never trained to fill blanks and
   a fabricated answer would teach the wrong thing. The note mentions the
   original next-sentence objective and that later variants dropped it.

3. **Then reuse it.** A trunk-and-head diagram: the same 12 pre-trained
   blocks every time, one small new layer per task, tuned briefly. Four
   tasks to switch between, distinguishing whole-text tasks (which read the
   summary token's vector) from per-word tasks (which read every word's).
   The note gives BERT-base and BERT-large shapes and points at the
   language-models example for the decoder side.

## What is real here

All strips are computed live by the transformers example's `transformer.ts`
on its four sentences. Nothing is trained for this page; nothing is faked.
The similarity numbers are measured on the vectors shown.

## Architecture

- `BertPage.tsx` — the page and its three panels.
- `bert.css` — the little it needs beyond the attention and transformer
  stylesheets it imports.

No trainer and no asset of its own.
