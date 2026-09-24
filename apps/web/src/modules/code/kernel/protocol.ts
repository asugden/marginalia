// Messages between the notebook page and the Python worker.
//
// Kept in one file so both sides agree on the wire shape. Every output is
// structured data (see CellOutput in ../api.ts) — the worker never hands the
// page HTML to inject.

import type { CellOutput } from "../api.js";

export type ToWorker =
  | { type: "init"; indexURL: string }
  | { type: "run"; runId: number; code: string; count: number }
  | { type: "writeFile"; reqId: number; name: string; data: ArrayBuffer }
  | { type: "deleteFile"; reqId: number; name: string }
  | { type: "listFiles"; reqId: number }
  | { type: "readFile"; reqId: number; name: string };

export interface FileInfo {
  name: string;
  size: number;
}

export type FromWorker =
  | { type: "ready"; pythonVersion: string }
  | { type: "initError"; message: string }
  /** Human-readable progress: "Loading pandas…". */
  | { type: "status"; runId: number | null; message: string }
  | { type: "output"; runId: number; output: CellOutput }
  | { type: "runDone"; runId: number; ok: boolean }
  | { type: "reply"; reqId: number; ok: true; files?: FileInfo[]; data?: ArrayBuffer }
  | { type: "reply"; reqId: number; ok: false; message: string };
