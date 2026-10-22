# Example: Reading data

`/examples/reading-data`. One small CSV (`visitors.csv`, the machine-learning
overview's spreadsheet) followed from disk into Python, for readers who have
never written code. Six panels, each one idea:

1. **A file is just text.** The raw characters beside the same data as a
   spreadsheet; pointing at a cell lights it in both. A switch shows the
   line breaks.
2. **Parentheses mean go.** Pairs such as `f.read` / `f.read()`: a name
   points at a function, parentheses run it.
3. **Reading it with plain Python.** `open` → `read` → `close` →
   `splitlines` → `split` → `int`, one line per step, with every name made
   so far and its type.
4. **Strings and numbers.** `"3" + "21"` against `3 + 21` (and `*`), with
   Python's real errors for mixed types; then `int()` tried on cells from
   the file.
5. **A function collects the steps.** `def read_rows(path)`: defining runs
   nothing, naming it runs nothing, calling it runs everything.
6. **A library is functions someone else wrote.** `import pandas as pd`
   and `pd.read_csv`, without the import (NameError) and with it (the
   DataFrame, with the type pandas chose for each column).

## Files

- `content.ts` — every word on the page, the CSV, and the hover text for
  words in the code. Edit freely. Step code lines and the parentheses pairs
  are matched by exact text in the page (which computes their values), so
  change those only alongside `ReadDataPage.tsx`.
- `py.ts` — a sliver of Python: reprs, `int()`, `+` and `*` with Python's
  exact error messages, the plain-Python parse, and pandas' type guess.
  Every value on the page is computed from the CSV; none is pasted in.
- `PyCode.tsx` — code blocks (DS tooltips on words), value readouts, type
  badges.
- `ReadDataPage.tsx`, `read-data.css`.

## The colour rule

A string is salmon and a number is blue everywhere: in code, in values, in
type badges, in the DataFrame's cells. These are general data-mark hues
(docs/style.md §11), never the brand accent, which marks only the hovered
cell in panel 1 and the chosen buttons.

## Things that will bite you

- DS tooltips are one line and cut off past about 50 characters; keep
  `TOOLTIPS` entries short.
- Addresses in reprs (`0x7f3a…`) are fixed, so the page is identical for
  every viewer; real Python prints a different one each run.
- `pandasType` reproduces `read_csv`'s guess for simple columns (all whole
  numbers → `int64`, all numbers → `float64`, else `object`). Missing
  values, dates and quoted fields are not modelled; keep the CSV simple.
