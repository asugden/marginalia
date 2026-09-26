# code (web)

The notebook UI, the in-browser Python runtime, and the instructor pages for
**Code**. Server side and invariants: `apps/worker/src/modules/code/README.md`.

## Surfaces

| Route | Page | Who |
|---|---|---|
| `/course/:id/code` | `CodeHomePage`: assignments, then scratch notebooks | student |
| `/course/:id/code/assignment/:aid` | `OpenAssignmentNotebook`: open-or-create, then redirect | student |
| `/course/:id/code/:notebookId` | `NotebookPage`: full screen, like the writing editor | student |
| `/course/:id/instructor/code` | `InstructorCodePage`: author assignments inline | instructor |
| `/course/:id/instructor/code/:aid` | `RosterPage`: every student, latest submission | instructor |
| `/course/:id/instructor/code/:aid/starter` | `NotebookPage` in starter mode | instructor |
| `/course/:id/instructor/code/submissions/:sid` | `SubmissionPage`: read-only, with origin marks | instructor |
| `/course/:id/instructor/code/submissions/:sid/scratch` | `NotebookPage` in sandbox mode: runnable, saves nothing, salmon | instructor |

Nothing appears in any nav until the course turns Code on in Settings
(`codeEnabled`, default off). The Code tab, the student nav item, and the
Assign menu's "Coding assignment" entry all key off that one flag.

## The Python runtime (`kernel/`)

- `python.worker.ts` loads Pyodide in a Web Worker from `pyodideIndexURL()`:
  the jsDelivr CDN at a pinned version, or `VITE_PYODIDE_BASE` for a
  self-hosted copy. Packages load on first import. `%pip install name` works
  for pure-Python packages from PyPI.
- **littletorch** (`packages/littletorch`), a small PyTorch-shaped
  neural-network library on NumPy, is bundled into the worker as source
  (`import.meta.glob`, about 45 KB) and written into site-packages at
  startup, so `import littletorch` needs no download. The worker loads NumPy
  first for any cell that imports it, since Pyodide can't see a bundled
  package's own imports.
- The worker's Python runtime runs cells in a private namespace, Jupyter
  style: the last expression is displayed, a trailing `;` hides it,
  `display()` exists, and `plt.show()` emits the figure in order. DataFrames
  become structured tables. Nothing is emitted as HTML.
- `kernel.ts` queues runs one at a time. **Stop** terminates the worker and
  starts a new one, because interrupting busy WebAssembly would need
  cross-origin isolation headers the app doesn't send. Variables are lost.
- `files.ts` keeps uploaded files in IndexedDB, per notebook, and re-mounts
  them whenever Python starts. They never leave the browser.

The whole module is lazy-loaded, so CodeMirror and the worker are only
downloaded by someone who opens a notebook. Pyodide itself (~30 MB with the
scientific stack) downloads on first run and is then cached by the browser.

## The editor (`CodeEditor.tsx`)

CodeMirror 6 with Python highlighting, indentation, undo, and bracket
matching. **No autocompletion**: `@codemirror/autocomplete`'s extension is not
installed, so the completion data `lang-python` registers is inert.
Browser spellcheck and autocorrect are off in cells. Shift+Enter runs and
advances; Ctrl/Cmd+Enter runs in place.

## Documentation popup (`components/docsPopup.ts`)

Typing `(` after a library call shows what that library accepts: its
parameters, the first paragraph of its docstring, and the defining module.
This is documentation lookup, not completion — it proposes nothing, inserts
nothing, and cannot write to the cell, so origin tracking has nothing to
record and it runs in every mode.

Shaped for beginners rather than for completeness:

- **No type annotations.** A pandas signature's real hints are unions running
  several lines; the names and defaults carry what a student needs.
- **Required parameters read differently from optional ones** — full-strength
  ink versus muted, which is the distinction that matters at a call site.
- **The parameter the cursor is in is highlighted** in the accent colour.
  Position decides it, except that a keyword argument (`sep=`) pins it by
  name. Commas inside strings and nested calls don't miscount.
- **The list is windowed**: every required parameter, three past the cursor,
  never fewer than six. Whatever that leaves out is shown as `+N more`, never
  silently dropped.
- **No `*` or `/` entries.** Those are separators in Python's rendered
  signature, not parameters; iterating `.parameters` omits them.

The name is resolved by `inspect.signature` in the live Python namespace
(`_mg_signature` in the worker runtime), with the docstring's own first line
as a fallback for C functions that expose no signature — including the
old-style `f(a, b[, c])` bracket convention for optional arguments. Two
limits, both of which simply mean no popup rather than an error:

- **Only what's already imported.** The lookup evaluates the name in the
  running namespace, so `np.linspace` is unknown until some cell has run
  `import numpy as np`.
- **Only when Python is idle.** Pyodide is single-threaded; the worker
  declines the lookup outright while a cell runs, so a popup never makes a
  student wait behind their own computation.

Only plain dotted names resolve (`np.linspace`, `pd.read_csv`). A call on an
expression — `df.groupby("a").mean(` — doesn't, since its type isn't knowable
without running it. Names defined in the notebook are skipped deliberately:
anything in `__main__` is the student's own code, and this shows what
libraries expect, not what the student just wrote. Escape dismisses.

Surfaces come from the shared tokens the app's other menus use
(`--surface-raised`, `--border`, `--shadow-lg`), so it reads as one product.

## Origin tracking (`components/originTracking.ts`)

A CodeMirror extension per cell, on only for a submit-mode assignment. It
uses the shared rules from `@marginalia/provenance` (one `MoveBuffer` for
the whole notebook, the AI chat-text reversion index, `spliceRuns`) and emits
events that `NotebookPage` batches to `/events` every 3 s. Each cell keeps its
live runs in `cell.origins` so a reload restores them. Nothing here is
authoritative; the server re-derives the render at submission. Students never
see marks.

## Page modes (`NotebookPage`)

- **student** — the caller's notebook. Chat if the assignment has it;
  Submit unless it's practice.
- **starter** — the instructor's starter editor. The AI chat, when on, is a
  preview that stores nothing.
- **sandbox** — an instructor's scratch copy of a submission. Saves nothing
  (no notebook writes, no events, no file storage), marked in salmon.

## Styling

`components/css/screens/code.css`. The shell reuses the writing editor's
classes (`prov-shell`, `prov-toggle`, `prov-divider`, the chat pane), so both
tools read as one product. Colours are tokens only.

## State shape (NotebookPage)

`cells` is the source of truth and is saved, outputs included, on a 1.2 s
debounce. `runState` (queued / running / done + execution count) is
per-session and never saved. `fitForSave` drops figures, oldest first, when a
save would exceed the server cap.
