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
