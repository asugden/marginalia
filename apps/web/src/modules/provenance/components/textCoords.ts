// Plain-text coordinates for a live ProseMirror document.
//
// The event log is replayed on the server against the document's plain-text
// projection (@marginalia/provenance projection.ts). This file applies the
// same rule to the live editor document, so an edit can be logged as "at
// offset N of the plain text, remove this, insert that" rather than in editor
// positions, which differ at every block boundary. See migration 0025.

import type { MarkType, Node as PMNode } from "@tiptap/pm/model";
import { NEWLINE_BLOCKS } from "@marginalia/provenance";
import type { Origin } from "./OriginMark.js";

interface OriginRun {
  origin: Origin;
  length: number;
}

interface Visitor {
  /** A projected character in [from, to), with its origin. */
  (ch: string, origin: Origin): void;
}

/**
 * Walk the projection of [from, to) in editor positions. A block's newline
 * sits at its closing position, so it belongs to the range iff
 * from < blockEnd <= to — which makes consecutive ranges tile the projection
 * exactly, with no character counted twice or skipped.
 */
function walk(doc: PMNode, from: number, to: number, originType: MarkType | undefined, visit: Visitor): void {
  const visitNode = (node: PMNode, pos: number, contentStart: number) => {
    const end = pos + node.nodeSize;
    if (node.isText) {
      const s = Math.max(from, pos);
      const e = Math.min(to, end);
      if (e <= s) return;
      const mark = originType ? node.marks.find((m) => m.type === originType) : undefined;
      const origin = (mark?.attrs.origin as Origin | undefined) ?? "human";
      const text = node.text ?? "";
      for (let i = s - pos; i < e - pos; i++) visit(text[i]!, origin);
      return;
    }
    // Skip subtrees entirely outside the range, but not a block whose closing
    // position (its newline) is inside it.
    if (end < from || pos > to) return;
    node.forEach((child, offset) => visitNode(child, contentStart + offset, contentStart + offset + 1));
    // A newline is "typed" as part of making the block; it carries no mark.
    if (NEWLINE_BLOCKS.has(node.type.name) && end > from && end <= to) visit("\n", "human");
  };
  // The doc node's content starts at 0; every other node's at pos + 1.
  doc.forEach((child, offset) => visitNode(child, offset, offset + 1));
}

/** Plain-text offset of an editor position. */
export function textOffsetAt(doc: PMNode, pos: number): number {
  let n = 0;
  walk(doc, 0, pos, undefined, () => {
    n++;
  });
  return n;
}

/** The projected text of an editor range, and the origins its characters carry. */
export function projectRange(
  doc: PMNode,
  from: number,
  to: number,
  originType: MarkType | undefined,
): { text: string; runs: OriginRun[] } {
  let text = "";
  const runs: OriginRun[] = [];
  walk(doc, from, to, originType, (ch, origin) => {
    text += ch;
    const last = runs[runs.length - 1];
    if (last && last.origin === origin) last.length += 1;
    else runs.push({ origin, length: 1 });
  });
  return { text, runs };
}

/**
 * The minimal plain-text change a step made, found inside the step's own
 * range: common prefix and suffix are trimmed, so wrapping a paragraph in a
 * list, say, is logged as the one newline it adds rather than as deleting and
 * retyping the whole paragraph (which would erase its origins).
 */
export function diffStep(
  pre: PMNode,
  post: PMNode,
  preFrom: number,
  preTo: number,
  postFrom: number,
  postTo: number,
  originType: MarkType | undefined,
): { offset: number; removed: string; removedRuns: OriginRun[]; inserted: string } {
  const base = textOffsetAt(pre, preFrom);
  const before = projectRange(pre, preFrom, preTo, originType);
  const after = projectRange(post, postFrom, postTo, undefined).text;
  let p = 0;
  while (p < before.text.length && p < after.length && before.text[p] === after[p]) p++;
  let s = 0;
  while (
    s < before.text.length - p &&
    s < after.length - p &&
    before.text[before.text.length - 1 - s] === after[after.length - 1 - s]
  ) {
    s++;
  }
  const removed = before.text.slice(p, before.text.length - s);
  // Slice the removed range's runs to [p, len - s).
  const removedRuns: OriginRun[] = [];
  let at = 0;
  for (const r of before.runs) {
    const lo = Math.max(at, p);
    const hi = Math.min(at + r.length, before.text.length - s);
    if (hi > lo) {
      const last = removedRuns[removedRuns.length - 1];
      if (last && last.origin === r.origin) last.length += hi - lo;
      else removedRuns.push({ origin: r.origin, length: hi - lo });
    }
    at += r.length;
  }
  return { offset: base + p, removed, removedRuns, inserted: after.slice(p, after.length - s) };
}
