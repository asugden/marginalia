# Example: Large Language Models

A standalone, static, interactive page. Mounted at
`/examples/language-models`. No backend and no data file: the Markov chain
and the tokens are small tables in `markov.ts` and `tokens.ts`.

## Where it sits

The [transformers](../transformers/README.md) example builds one
**transformer block**. This page starts further back, with a Markov chain of
words, and ends with real models at scale: a language model draws the next
word from a list of odds exactly as the chain does; what changes is that its
current state is the whole text, and the odds come out of a network.

## What it shows

1. **Markov chain of words.** The current state is one word or two (the
   switch starts at one). The candidates for the next word hang in a column
   through a gap at the end of the text, the word2vec example's substitution
   reel turned to generation, each with its probability to the right. Two
   presses per word: *Draw a word* rolls the column and lands one on the
   line, *Add it* moves the state along. Below, a readout of longer example
   text from the same chain. Counts are real, from about 20,000 words of
   Twilight fan fiction split on spaces; each percentage is the word's share
   among the listed options (the most frequent followers of the state, at
   most five). With a two-word state several steps have a single option,
   which is the chain copying its training text.
2. **Tokens in, a token out.** Fixed sentences split by the o200k tokenizer
   (gpt-oss, GPT-4o), with real IDs and a stand-in embedding row under each
   (8 cells on the computed scale). Then how the vocabulary is built: one
   word (" storybooks") replayed from letters to its two tokens, one real merge per
   row, the new piece picked out, and beside each merge why: its place in
   o200k's merge order and how often the pair occurs in the fan fiction,
   with the words it occurs in. One fixed text ("The storybooks I love") runs
   from the tokens through to the output. Then the output side: a histogram of
   probabilities over the vocabulary, unsorted as the model emits them (top
   five from panel 3 among illustrative small ones), one ID drawn, looked up, and appended.
3. **One word at a time.** The whole model as one pass, left to right: text,
   tokenizer, embedding (+ position), 36 transformer blocks, the final fully
   connected layer (2,880 → 201,088), probabilities, draw, and the loop back.
   Under it the same reel as panel 1, but the current state bracket covers
   every token so far. Tokens and IDs are real; the probabilities are
   estimates written for the page, and the note says so.
4. **How big they get.** A pointer to the
   [counting parameters](../parameter-budget/README.md) example, which carries
   the grid of real models' shapes ("Make it bigger!") and the table of
   published shapes, with their sources.

## Walks are fixed

Both reels land on a scripted word at every step, so the walk is the same
each time it is shown. The roll on the way there is drawn with the step's
own probabilities. `walk.ts` holds the stepping; `prefers-reduced-motion`
skips the roll.

## Colours

Probabilities are computed and cannot go below zero: paper to vermillion,
values in `--ml-value-pos-ink`. The accent marks only the drawn word.
Embedding cells, neurons and token chips are structure, in neutral greys and
sand.

## Files

- `markov.ts` — the two Markov walks, their counts and example passages.
- `tokens.ts` — tokenized sentences and the language-model walk.
- `walk.ts` — stepping and the roll.
- `NextWordReel.tsx` — the slot, shared by panels 1 and 3.
- `MarkovPanel.tsx`, `TokenizerPanel.tsx`, `GeneratePanel.tsx`,
  `PipelineFigure.tsx` — panels 1–3.
- `LanguageModelsPage.tsx` — the page.
- `language-models.css` — layout and figure styling.
