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
  | { type: "readFile"; reqId: number; name: string }
  | { type: "signature"; reqId: number; name: string };

/** One parameter of a library callable. Type annotations are deliberately
 *  absent — see _mg_params in python.worker.ts. */
export interface ParamInfo {
  /** Parameter name; `*args` / `**kwargs` keep their stars. */
  name: string;
  /** No default: the caller must supply it. */
  required: boolean;
  /** Repr of the default, already truncated. Null when required. */
  default: string | null;
  /** True for `*args` / `**kwargs`, which absorb any number of arguments. */
  variadic: boolean;
}

/** What a library callable accepts, for the docs popup. */
export interface SignatureInfo {
  /** The dotted name as written in the cell, e.g. `np.linspace`. */
  name: string;
  /** Parameters in declaration order. */
  params: ParamInfo[];
  /** First paragraph of the docstring; may be empty. */
  summary: string;
  /** Defining module, shown as provenance for the docs. */
  module: string;
}

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
  | {
      type: "reply";
      reqId: number;
      ok: true;
      files?: FileInfo[];
      data?: ArrayBuffer;
      /** Present for a "signature" request; null when the name is unknown. */
      signature?: SignatureInfo | null;
    }
  | { type: "reply"; reqId: number; ok: false; message: string };
