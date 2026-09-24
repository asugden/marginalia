// Page-side handle on the Python worker.
//
// One Kernel per open notebook. Runs are queued and executed one at a time,
// in the order the student asked for them, like a Jupyter kernel. "Stop"
// terminates the worker and starts a fresh one: Python state is lost, which
// is the honest cost of stopping WebAssembly that is busy computing. Files
// the student uploaded are re-mounted from browser storage on restart.

import type { CellOutput } from "../api.js";
import type { FileInfo, FromWorker, ToWorker } from "./protocol.js";

export type KernelStatus = "starting" | "idle" | "busy" | "error";

/** Pinned so every student in a course runs the same Python and packages. */
export const PYODIDE_VERSION = "314.0.7";

/** Where Pyodide and its packages load from. A deployment can self-host the
 *  bundle and point VITE_PYODIDE_BASE at it; otherwise the public CDN. */
export function pyodideIndexURL(): string {
  const configured = (import.meta.env.VITE_PYODIDE_BASE as string | undefined)?.trim();
  const base = configured || `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  return base.endsWith("/") ? base : `${base}/`;
}

interface PendingRun {
  runId: number;
  code: string;
  onOutput: (o: CellOutput) => void;
  onStatus: (m: string) => void;
  onStart: (count: number) => void;
  resolve: (r: { ok: boolean; stopped: boolean }) => void;
}

type Listener = (s: KernelStatus, detail?: string) => void;
/** A request message minus its id. Distributes over the union, which a plain
 *  Omit<> would collapse to the shared fields only. */
type RequestBody<M = Extract<ToWorker, { reqId: number }>> = M extends unknown ? Omit<M, "reqId"> : never;

export class Kernel {
  private worker: Worker | null = null;
  private status: KernelStatus = "starting";
  private detail: string | undefined;
  private listeners = new Set<Listener>();
  private queue: PendingRun[] = [];
  private active: PendingRun | null = null;
  private nextRunId = 1;
  private nextReqId = 1;
  private executionCount = 0;
  private replies = new Map<number, (m: Extract<FromWorker, { type: "reply" }>) => void>();
  private readyPromise: Promise<void> = Promise.resolve();

  /** Called after each (re)start so the host can mount stored files. */
  constructor(private readonly onReady: (k: Kernel) => Promise<void>) {
    this.boot();
  }

  getStatus(): KernelStatus {
    return this.status;
  }
  getDetail(): string | undefined {
    return this.detail;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status, this.detail);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: KernelStatus, detail?: string) {
    this.status = s;
    this.detail = detail;
    for (const fn of this.listeners) fn(s, detail);
  }

  private boot() {
    this.setStatus("starting", "Starting Python…");
    const worker = new Worker(new URL("./python.worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    this.readyPromise = new Promise<void>((resolve) => {
      worker.onmessage = (ev: MessageEvent<FromWorker>) => {
        const msg = ev.data;
        if (msg.type === "ready") {
          void this.onReady(this).finally(() => {
            resolve();
            this.setStatus("idle", `Python ${msg.pythonVersion}`);
            this.pump();
          });
          return;
        }
        if (msg.type === "initError") {
          this.setStatus(
            "error",
            `Python could not start (${msg.message}). Check your connection and reload.`,
          );
          resolve();
          return;
        }
        this.handle(msg);
      };
      worker.onerror = (e) => {
        this.setStatus("error", e.message || "The Python worker crashed.");
        resolve();
      };
    });
    const init: ToWorker = { type: "init", indexURL: pyodideIndexURL() };
    worker.postMessage(init);
  }

  private handle(msg: FromWorker) {
    switch (msg.type) {
      case "status":
        if (this.active && msg.runId === this.active.runId) this.active.onStatus(msg.message);
        return;
      case "output":
        if (this.active && msg.runId === this.active.runId) this.active.onOutput(msg.output);
        return;
      case "runDone": {
        const run = this.active;
        if (!run || run.runId !== msg.runId) return;
        this.active = null;
        run.resolve({ ok: msg.ok, stopped: false });
        this.setStatus("idle", this.detail);
        this.pump();
        return;
      }
      case "reply": {
        const cb = this.replies.get(msg.reqId);
        this.replies.delete(msg.reqId);
        cb?.(msg);
        return;
      }
    }
  }

  private pump() {
    if (this.active || this.status !== "idle" || !this.worker) return;
    const next = this.queue.shift();
    if (!next) return;
    this.active = next;
    this.executionCount += 1;
    next.onStart(this.executionCount);
    this.setStatus("busy", this.detail);
    const msg: ToWorker = {
      type: "run",
      runId: next.runId,
      code: next.code,
      count: this.executionCount,
    };
    this.worker.postMessage(msg);
  }

  /** Queue a cell. Resolves when it finishes, fails, or is stopped. */
  run(
    code: string,
    handlers: {
      onOutput: (o: CellOutput) => void;
      onStatus?: (m: string) => void;
      onStart?: (count: number) => void;
    },
  ): Promise<{ ok: boolean; stopped: boolean }> {
    return new Promise((resolve) => {
      this.queue.push({
        runId: this.nextRunId++,
        code,
        onOutput: handlers.onOutput,
        onStatus: handlers.onStatus ?? (() => {}),
        onStart: handlers.onStart ?? (() => {}),
        resolve,
      });
      this.pump();
    });
  }

  /** Stop everything: kill the worker, drop the queue, start fresh. */
  restart() {
    this.worker?.terminate();
    this.worker = null;
    const dropped = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = null;
    this.queue = [];
    this.executionCount = 0;
    for (const cb of this.replies.values()) {
      cb({ type: "reply", reqId: -1, ok: false, message: "Python restarted" });
    }
    this.replies.clear();
    for (const r of dropped) r.resolve({ ok: false, stopped: true });
    this.boot();
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
  }

  private request(
    msg: RequestBody,
    transfer: Transferable[] = [],
  ): Promise<Extract<FromWorker, { type: "reply" }>> {
    return new Promise((resolve) => {
      if (!this.worker) {
        resolve({ type: "reply", reqId: -1, ok: false, message: "Python is not running" });
        return;
      }
      const reqId = this.nextReqId++;
      this.replies.set(reqId, resolve);
      this.worker.postMessage({ ...msg, reqId } as ToWorker, transfer);
    });
  }

  /** Wait until Python has started (or failed to). */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  async writeFile(name: string, data: ArrayBuffer): Promise<void> {
    const copy = data.slice(0);
    const r = await this.request({ type: "writeFile", name, data: copy }, [copy]);
    if (!r.ok) throw new Error(r.message);
  }

  async deleteFile(name: string): Promise<void> {
    await this.request({ type: "deleteFile", name });
  }

  async listFiles(): Promise<FileInfo[]> {
    const r = await this.request({ type: "listFiles" });
    return r.ok ? (r.files ?? []) : [];
  }

  async readFile(name: string): Promise<ArrayBuffer> {
    const r = await this.request({ type: "readFile", name });
    if (!r.ok || !r.data) throw new Error(r.ok ? "No data" : r.message);
    return r.data;
  }
}
