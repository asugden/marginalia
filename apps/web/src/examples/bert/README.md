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

0. **Where the first vector comes from.** The transformers example took its
   vectors as given; BERT builds its own. Top: WordPiece — type a word, watch
   it split by greedy longest-match-first into pieces with `##` continuations.
   The algorithm is BERT's exactly; the piece list is a labelled stand-in of a
   few hundred pieces (`wordpiece.ts`), not the real 30,522. Bottom: the input
   row `[CLS] … [SEP]` for one of the four sentences, and for a chosen position
   the three strips that are added — token + position + segment = what enters
   block 1. The token strip is the transformers example's real 16-d vector;
   the position strip is the attention page's clock code (labelled: BERT learns
   a table of 512 instead); the segment strip is drawn flat (labelled: BERT
   learns two). Split words and special tokens have no vector on this page and
   show a hatched blank. Shapes quoted are BERT-base's.

1. **One vector per word, or one per use?** Pick a word that appears in more
   than one of the four sentences ("the", "a"). Three strips per sentence:
   the embedding (identical every time — that is what a lookup table means),
   what the word took from its context (visibly different per sentence), and
   the word after one block (mostly itself, no longer identical). The
   readout gives the least-similar pair for both. Honest about magnitude:
   one legibility-fitted block moves a word a few percent; BERT stacks
   twelve or twenty-four and the differences compound. The panel ends by
   naming the idea — contextual embeddings — and unpacking the acronym.

2. **Before BERT: ELMo.** A schematic, beside BERT. The recurrent example's
   Pac-Man twice, running in opposite directions along the sentence and
   meeting at the chosen word, each carrying only its own side's state; below
   it the same word under BERT, reached by arcs from every other word. The
   figure carries the "deeply bidirectional" claim by contrast; the caption
   gives the paper, the year, the two-LSTM design, and the Sesame Street
   lineage of the name. No ELMo is trained on this page and no numbers are
   shown; the state strips are outlines.

3. **Fill in the blank, from both sides.** Click any word to hide it. Arcs
   from every other word converge on the blank, colour-coded left and right,
   with a count of how many words each side contributes; a left-to-right
   model would have only the left. This is masked-language-model
   pre-training: no labels, one word in seven hidden, a few billion times.
   **No guesses are shown.** The block was never trained to fill blanks and
   a fabricated answer would teach the wrong thing. The note mentions the
   original next-sentence objective and that later variants dropped it.

   **CBOW, named.** The panel then puts skip-gram, CBOW and the masked
   language model side by side on the same sentence and the same word
   (`ObjectiveFigure.tsx`): one word in and neighbours out; neighbours in and
   the one word out; the ordered sentence with a blank in and the word out
   through twelve blocks. The embeddings page trains skip-gram, so the
   student arrives knowing one direction; the arrows show the flip. The
   prose says why the flip is forced by the goal — a vector for *this use*
   has to be built at the blank from the surroundings, which is CBOW's input
   side, not skip-gram's — and what BERT changes about CBOW (ordered, whole
   sentence, attention-weighted, deep).

4. **Then reuse it.** A trunk-and-head diagram: the same 12 pre-trained
   blocks every time, one small new layer per task, tuned briefly. Four
   tasks to switch between, distinguishing whole-text tasks (which read the
   summary token's vector) from per-word tasks (which read every word's).
   The note gives BERT-base and BERT-large shapes and points at the
   language-models example for the decoder side.

## What is real here

All strips are computed live by the transformers example's `transformer.ts`
on its four sentences. Nothing is trained for this page; nothing is faked.
The similarity numbers are measured on the vectors shown. The WordPiece split
runs BERT's algorithm over a stand-in piece list. The ELMo figure and the
three-objective figure are schematics with no numbers on them, and the page
says so where they appear.

## Architecture

- `BertPage.tsx` — the page and its five panels.
- `EmbeddingIntro.tsx` — pieces, and token + position + segment.
- `wordpiece.ts` — BERT's greedy longest-match-first split and the stand-in
  piece list.
- `ElmoFigure.tsx` — the two-reader schematic beside BERT's arcs; borrows
  the recurrent example's Pac-Man.
- `ObjectiveFigure.tsx` — skip-gram, CBOW and masked LM side by side.
- `bert.css` — the little it needs beyond the attention, transformer and
  recurrent stylesheets it imports.

No trainer and no asset of its own.
