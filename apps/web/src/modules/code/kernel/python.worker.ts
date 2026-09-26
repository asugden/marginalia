/// <reference lib="webworker" />
// The Python runtime: Pyodide (CPython compiled to WebAssembly) in a Web
// Worker, so a long-running cell never freezes the page.
//
// Pyodide is loaded from `indexURL` (a CDN by default; a deployment can point
// it at its own copy). Packages are fetched on demand from the same place the
// first time a cell imports them — numpy, pandas, matplotlib, scikit-learn,
// scipy and statsmodels are all prebuilt. Pure-Python packages from PyPI can
// be added with `%pip install name`.
//
// Stopping a runaway cell is done by terminating this worker (see kernel.ts).
// A cooperative interrupt would need SharedArrayBuffer, which needs
// cross-origin isolation headers the rest of the app does not send.

import type { CellOutput } from "../api.js";
import type { FromWorker, SignatureInfo, ToWorker } from "./protocol.js";

interface PyProxy {
  destroy(): void;
}
interface PyodideAPI {
  version: string;
  globals: { get(name: string): unknown; set(name: string, v: unknown): void };
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
    readdir(path: string): string[];
    stat(path: string): { size: number; mode: number };
    isFile(mode: number): boolean;
    mkdirTree(path: string): void;
  };
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  loadPackage(names: string[], opts?: { messageCallback?: (m: string) => void }): Promise<unknown>;
  loadPackagesFromImports(
    code: string,
    opts?: { messageCallback?: (m: string) => void; errorCallback?: (m: string) => void },
  ): Promise<unknown>;
  setStdout(opts: { write: (buf: Uint8Array) => number }): void;
  setStderr(opts: { write: (buf: Uint8Array) => number }): void;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const HOME = "/home/pyodide";
let py: PyodideAPI | null = null;
let currentRun: number | null = null;
const decoder = new TextDecoder();

function post(msg: FromWorker, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer);
}

function emit(output: CellOutput) {
  if (currentRun === null) return;
  post({ type: "output", runId: currentRun, output });
}

// The notebook runtime, installed once at startup. Everything it defines is
// prefixed `_mg_` so it stays out of the student's way in `dir()`.
const RUNTIME = String.raw`
import ast, base64, builtins, inspect, io, json, linecache, os, re, sys, traceback, warnings
os.environ["MPLBACKEND"] = "AGG"

_mg_ns = {"__name__": "__main__", "__builtins__": builtins}
_MG_MAX_ROWS = 50
_MG_MAX_COLS = 30

def _mg_send(obj):
    _mg_emit(json.dumps(obj))

def _mg_cell(v):
    s = str(v)
    return s if len(s) <= 200 else s[:199] + "…"

def _mg_table(value):
    pd = sys.modules.get("pandas")
    if pd is None:
        return None
    if isinstance(value, pd.Series):
        value = value.to_frame()
    if not isinstance(value, pd.DataFrame):
        return None
    rows, cols = value.shape
    head = value.iloc[:_MG_MAX_ROWS, :_MG_MAX_COLS]
    return {
        "type": "table",
        "columns": [_mg_cell(c) for c in head.columns],
        "index": [_mg_cell(i) for i in head.index],
        "rows": [[_mg_cell(v) for v in r] for r in head.itertuples(index=False, name=None)],
        "shape": [int(rows), int(cols)],
    }

def _mg_is_mpl_noise(value):
    # plt.plot(...) as a cell's last line returns a list of artists. Showing
    # "[<matplotlib.lines.Line2D at 0x...>]" under every plot is noise.
    mpl = sys.modules.get("matplotlib.artist")
    if mpl is None:
        return False
    items = value if isinstance(value, (list, tuple)) else [value]
    return len(items) > 0 and all(isinstance(v, mpl.Artist) for v in items)

def _mg_png(fig):
    # Rendering is the runtime's doing, not the student's, so library
    # deprecation noise raised inside savefig is not theirs to read.
    buf = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fig.savefig(buf, format="png", bbox_inches="tight", dpi=100)
    _mg_send({"type": "image", "mime": "image/png",
              "data": base64.b64encode(buf.getvalue()).decode("ascii")})

def _mg_flush_figures():
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return
    for num in plt.get_fignums():
        _mg_png(plt.figure(num))
    plt.close("all")

def display(*values):
    """Show a value below the cell, as Jupyter's display() does."""
    for value in values:
        if value is None:
            continue
        mpl_fig = sys.modules.get("matplotlib.figure")
        if mpl_fig is not None and isinstance(value, mpl_fig.Figure):
            _mg_png(value)
            continue
        table = _mg_table(value)
        if table is not None:
            _mg_send(table)
            continue
        if _mg_is_mpl_noise(value):
            continue
        _mg_send({"type": "result", "text": repr(value)})

builtins.display = display

def _mg_no_input(*args, **kwargs):
    raise RuntimeError("input() isn't available in this notebook. Set the value in code instead.")
builtins.input = _mg_no_input

async def _mg_pip(spec):
    import micropip
    names = [n for n in spec.split() if not n.startswith("-")]
    print("Installing " + ", ".join(names) + "…")
    await micropip.install(names)
    print("Installed.")

_MG_PIP = re.compile(r"^(\s*)[%!]pip\s+install\s+(.+?)\s*$")

def _mg_transform(src):
    """Turn %pip / !pip install lines into awaited micropip calls."""
    out = []
    for line in src.splitlines():
        m = _MG_PIP.match(line)
        out.append(f"{m.group(1)}await _mg_pip({m.group(2)!r})" if m else line)
    return "\n".join(out)

def _mg_patch_show():
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is not None and getattr(plt.show, "__name__", "") != "_mg_show":
        def _mg_show(*args, **kwargs):
            _mg_flush_figures()
        plt.show = _mg_show

def _mg_params(sig):
    """Structured parameters, with type hints dropped.

    Iterating .parameters (rather than str(sig)) is what keeps the bare '*'
    and '/' markers out: those are rendered separators in the string form,
    not parameters. They mean nothing to a beginner, so they never appear.

    Annotations are dropped deliberately. A pandas signature's real hints are
    unions many lines long; for students learning what a function takes, the
    names and defaults carry all the useful information.
    """
    out = []
    for prm in sig.parameters.values():
        if prm.name == "self":
            continue
        required = prm.default is inspect.Parameter.empty
        if prm.kind == inspect.Parameter.VAR_POSITIONAL:
            out.append({"name": "*" + prm.name, "required": False, "default": None,
                        "variadic": True})
            continue
        if prm.kind == inspect.Parameter.VAR_KEYWORD:
            out.append({"name": "**" + prm.name, "required": False, "default": None,
                        "variadic": True})
            continue
        default = None
        if not required:
            try:
                default = repr(prm.default)
            except Exception:
                default = "…"
            if len(default) > 40:
                default = default[:39] + "…"
        out.append({"name": prm.name, "required": required, "default": default,
                    "variadic": False})
    return out

def _mg_parse_doc_params(sig_text):
    """Fallback for C functions: parse names out of a docstring signature.

    Only the shape 'name(a, b=1, *c)' is understood. Defaults are kept as
    written; '*'/'/' separators are dropped exactly as above.
    """
    inner = sig_text.strip()
    if inner.startswith("(") and inner.endswith(")"):
        inner = inner[1:-1]
    # Old-style C docstrings mark optional args with nested brackets, as in
    # 'datetime(year, month, day[, hour[, minute[, second]]])'. Everything from
    # the first '[' is optional; strip the brackets and remember where the
    # optional tail began.
    opt_from = inner.find("[")
    if opt_from != -1:
        inner = inner.replace("[", "").replace("]", "")
    out = []
    depth = 0
    buf = ""
    parts = []
    for ch in inner:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(buf)
            buf = ""
            continue
        buf += ch
    if buf.strip():
        parts.append(buf)
    seen = 0
    for raw in parts:
        tok = raw.strip()
        if not tok or tok in ("*", "/", "..."):
            continue
        name, eq, default = tok.partition("=")
        name = name.strip()
        if not name:
            continue
        variadic = name.startswith("*")
        # Anything that appeared inside the bracket tail is optional, even
        # without an '=default'.
        optional_by_bracket = opt_from != -1 and seen >= _mg_bracket_index(sig_text)
        out.append({
            "name": name,
            "required": not eq and not variadic and not optional_by_bracket,
            "default": (default.strip() or None) if eq else None,
            "variadic": variadic,
        })
        seen += 1
    return out

def _mg_bracket_index(sig_text):
    """How many parameters precede the first '[' in a C docstring signature."""
    head = sig_text[: sig_text.find("[")] if "[" in sig_text else sig_text
    return max(0, head.count(","))

def _mg_doc_signature(obj, name):
    """Parameters for a dotted name, or None if it is not a library call.

    Only objects that came from an imported module qualify. Anything the
    student defined in a cell lives in __main__ and is deliberately skipped:
    this shows what a library expects, never what the student just wrote.
    """
    module = getattr(obj, "__module__", None) or ""
    if module == "__main__" or module == "builtins" and not inspect.isbuiltin(obj):
        return None
    if not callable(obj):
        return None
    # For a class the useful parameters are the constructor's. signature()
    # on the class itself already reports those and omits self; __init__ is
    # the fallback for classes it can't read directly.
    candidates = [obj, getattr(obj, "__init__", None)] if inspect.isclass(obj) else [obj]
    params = None
    for target in candidates:
        if target is None:
            continue
        try:
            params = _mg_params(inspect.signature(target))
            break
        except (TypeError, ValueError):
            continue
    # A bare (*args, **kwargs) is what C types report when they expose no real
    # signature — useless to a student, so fall through to the docstring.
    if params is None or all(p["variadic"] for p in params):
        doc_params = None
        for line in (inspect.getdoc(obj) or "").strip().splitlines()[:2]:
            m = re.match(r"^\s*\w+(\(.*\))", line)
            if m:
                doc_params = _mg_parse_doc_params(m.group(1))
                break
        if doc_params:
            params = doc_params
        elif params is None:
            return None
    doc = inspect.getdoc(obj) or ""
    summary = ""
    for para in doc.split("\n\n"):
        para = " ".join(para.split())
        if para:
            summary = para if len(para) <= 240 else para[:239] + "…"
            break
    return {"name": name, "params": params, "summary": summary, "module": module}

def _mg_signature(name):
    """Resolve a dotted name against the live namespace and describe it."""
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*", name or ""):
        return None
    try:
        obj = eval(name, _mg_ns)
    except Exception:
        # Not imported yet, or not a plain name. No popup, no error.
        return None
    try:
        return _mg_doc_signature(obj, name)
    except Exception:
        return None

def _mg_format_error(e, filename):
    te = traceback.TracebackException.from_exception(e)
    # Drop this runtime's own frames; keep the student's cell and any library
    # frames beneath it (they're often where the useful message is).
    te.stack = traceback.StackSummary.from_list(
        [f for f in te.stack if f.filename == filename or not f.filename.startswith("<")]
    )
    return {
        "type": "error",
        "ename": type(e).__name__,
        "evalue": str(e),
        "traceback": "".join(te.format()),
    }

async def _mg_run(src, count):
    filename = f"<cell {count}>"
    src = _mg_transform(src)
    linecache.cache[filename] = (len(src), None, src.splitlines(True), filename)
    flags = ast.PyCF_ALLOW_TOP_LEVEL_AWAIT
    try:
        if "matplotlib" in src and "matplotlib.pyplot" not in sys.modules:
            # Import pyplot up front so plt.show() is already ours in the very
            # first cell that uses it (the AGG default would warn and do nothing).
            import matplotlib.pyplot
        _mg_patch_show()
        tree = ast.parse(src, filename, "exec")
        last = None
        # A trailing semicolon hides the last value, as in Jupyter.
        if tree.body and isinstance(tree.body[-1], ast.Expr) and not src.rstrip().endswith(";"):
            last = ast.Expression(tree.body.pop().value)
        code = compile(tree, filename, "exec", flags=flags)
        result = eval(code, _mg_ns)
        if inspect.iscoroutine(result):
            await result
        _mg_patch_show()
        if last is not None:
            value = eval(compile(last, filename, "eval", flags=flags), _mg_ns)
            if inspect.iscoroutine(value):
                value = await value
            _mg_patch_show()
            if value is not None:
                _mg_flush_figures()
                display(value)
        _mg_flush_figures()
        return True
    except BaseException as e:
        sys.stdout.flush()
        sys.stderr.flush()
        try:
            _mg_flush_figures()
        except Exception:
            pass
        _mg_send(_mg_format_error(e, filename))
        return False
`;

// Python packages shipped with the notebook itself, bundled at build time as
// text and written into site-packages on startup, so `import littletorch`
// works with no download and no install. See packages/littletorch.
const BUNDLED = import.meta.glob("../../../../../../packages/littletorch/littletorch/**/*.py", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function installBundledPackages(p: PyodideAPI) {
  const site = String(p.runPython("import site; site.getsitepackages()[0]"));
  for (const [path, source] of Object.entries(BUNDLED)) {
    const rel = path.split("/packages/littletorch/")[1];
    if (!rel) continue;
    const target = `${site}/${rel}`;
    p.FS.mkdirTree(target.slice(0, target.lastIndexOf("/")));
    p.FS.writeFile(target, new TextEncoder().encode(source));
  }
}

async function init(indexURL: string) {
  try {
    const mod = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as {
      loadPyodide: (opts: { indexURL: string }) => Promise<PyodideAPI>;
    };
    const p = await mod.loadPyodide({ indexURL });
    p.setStdout({
      write: (buf) => {
        emit({ type: "stream", name: "stdout", text: decoder.decode(buf) });
        return buf.length;
      },
    });
    p.setStderr({
      write: (buf) => {
        emit({ type: "stream", name: "stderr", text: decoder.decode(buf) });
        return buf.length;
      },
    });
    p.globals.set("_mg_emit", (s: string) => {
      try {
        emit(JSON.parse(s) as CellOutput);
      } catch {
        /* a malformed output is dropped rather than crashing the run */
      }
    });
    p.runPython(RUNTIME);
    installBundledPackages(p);
    py = p;
    post({ type: "ready", pythonVersion: String(p.runPython("import sys; sys.version.split()[0]")) });
  } catch (e) {
    post({ type: "initError", message: e instanceof Error ? e.message : String(e) });
  }
}

async function run(runId: number, code: string, count: number) {
  if (!py) {
    post({ type: "runDone", runId, ok: false });
    return;
  }
  currentRun = runId;
  let ok = false;
  try {
    // Fetch any prebuilt packages this cell imports before running it.
    // Failures here are not fatal: the import itself will raise a normal
    // ModuleNotFoundError the student can read.
    try {
      // Pyodide can't see a bundled package's own imports, so load what it
      // needs before a cell that uses it.
      if (/\blittletorch\b/.test(code)) await py.loadPackage(["numpy"], { messageCallback: () => {} });
      await py.loadPackagesFromImports(code, {
        messageCallback: (m) => {
          if (/^Loading /.test(m)) post({ type: "status", runId, message: m });
        },
        errorCallback: () => {},
      });
    } catch {
      /* fall through to the run */
    }
    const runner = py.globals.get("_mg_run") as ((src: string, n: number) => Promise<boolean>) & Partial<PyProxy>;
    ok = Boolean(await runner(code, count));
    runner.destroy?.();
  } catch (e) {
    emit({
      type: "error",
      ename: "InternalError",
      evalue: e instanceof Error ? e.message : String(e),
      traceback: "",
    });
  } finally {
    currentRun = null;
    post({ type: "runDone", runId, ok });
  }
}

function safeName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  if (!base || base === "." || base === ".." || base.length > 200) return null;
  return base;
}

ctx.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "init":
      void init(msg.indexURL);
      return;
    case "run":
      void run(msg.runId, msg.code, msg.count);
      return;
    case "writeFile": {
      const name = safeName(msg.name);
      if (!py || !name) {
        post({ type: "reply", reqId: msg.reqId, ok: false, message: "Invalid file" });
        return;
      }
      py.FS.writeFile(`${HOME}/${name}`, new Uint8Array(msg.data));
      post({ type: "reply", reqId: msg.reqId, ok: true });
      return;
    }
    case "deleteFile": {
      const name = safeName(msg.name);
      try {
        if (py && name) py.FS.unlink(`${HOME}/${name}`);
        post({ type: "reply", reqId: msg.reqId, ok: true });
      } catch (e) {
        post({ type: "reply", reqId: msg.reqId, ok: false, message: String(e) });
      }
      return;
    }
    case "listFiles": {
      if (!py) {
        post({ type: "reply", reqId: msg.reqId, ok: true, files: [] });
        return;
      }
      const files = py.FS.readdir(HOME)
        .filter((n) => n !== "." && n !== ".." && !n.startsWith("."))
        .map((n) => ({ n, st: py!.FS.stat(`${HOME}/${n}`) }))
        .filter(({ st }) => py!.FS.isFile(st.mode))
        .map(({ n, st }) => ({ name: n, size: st.size }))
        .sort((a, b) => a.name.localeCompare(b.name));
      post({ type: "reply", reqId: msg.reqId, ok: true, files });
      return;
    }
    case "signature": {
      // Documentation lookup, not code generation: resolve a name the student
      // already typed against the modules they already imported. Declined
      // while a cell is running — Pyodide is single-threaded, and a popup is
      // never worth making a student wait behind their own computation.
      if (!py || currentRun !== null) {
        post({ type: "reply", reqId: msg.reqId, ok: true, signature: null });
        return;
      }
      try {
        const lookup = py.globals.get("_mg_signature") as ((n: string) => unknown) & Partial<PyProxy>;
        const res = lookup(msg.name) as { toJs?: (o: { dict_converter: unknown }) => unknown } | null;
        let info = null;
        if (res) {
          const toJs = (res as { toJs?: (o: { dict_converter: unknown }) => unknown }).toJs;
          info = toJs
            ? (toJs.call(res, { dict_converter: Object.fromEntries }) as SignatureInfo)
            : (res as unknown as SignatureInfo);
          (res as Partial<PyProxy>).destroy?.();
        }
        lookup.destroy?.();
        post({ type: "reply", reqId: msg.reqId, ok: true, signature: info });
      } catch {
        post({ type: "reply", reqId: msg.reqId, ok: true, signature: null });
      }
      return;
    }
    case "readFile": {
      const name = safeName(msg.name);
      try {
        const bytes = py!.FS.readFile(`${HOME}/${name}`);
        const data = bytes.slice().buffer as ArrayBuffer;
        post({ type: "reply", reqId: msg.reqId, ok: true, data }, [data]);
      } catch (e) {
        post({ type: "reply", reqId: msg.reqId, ok: false, message: String(e) });
      }
      return;
    }
  }
};
