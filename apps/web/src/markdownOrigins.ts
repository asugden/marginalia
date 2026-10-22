// Origin marks on rendered Markdown — used by <Markdown origins>.
//
// react-markdown keeps each hast text node's offsets into the source, so a
// text node can be split wherever an origin run starts or ends. Human text is
// left bare, as everywhere else. A node whose text isn't a verbatim slice of
// the source (an escape, an entity) takes the origin of its first character.

import type { OriginRun } from "@marginalia/provenance";

export interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

export function rehypeOrigins(source: string, runs: OriginRun[]) {
  const bounds: { start: number; end: number; origin: OriginRun["origin"] }[] = [];
  let at = 0;
  for (const r of runs) {
    bounds.push({ start: at, end: at + r.length, origin: r.origin });
    at += r.length;
  }
  const originAt = (i: number) => bounds.find((b) => i >= b.start && i < b.end)?.origin ?? "human";
  const mark = (origin: OriginRun["origin"], value: string): HastNode =>
    origin === "human"
      ? { type: "text", value }
      : {
          type: "element",
          tagName: "span",
          properties: { className: [`code-origin--${origin}`] },
          children: [{ type: "text", value }],
        };

  function split(node: HastNode): HastNode[] {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    const value = node.value ?? "";
    if (start === undefined || end === undefined) return [node];
    if (source.slice(start, end) !== value) return [mark(originAt(start), value)];
    const out: HastNode[] = [];
    let i = start;
    while (i < end) {
      const origin = originAt(i);
      let j = i + 1;
      while (j < end && originAt(j) === origin) j++;
      out.push(mark(origin, source.slice(i, j)));
      i = j;
    }
    return out;
  }

  function walk(node: HastNode): void {
    if (!node.children) return;
    node.children = node.children.flatMap((c) => {
      if (c.type === "text") return split(c);
      walk(c);
      return [c];
    });
  }

  return () => (tree: HastNode) => walk(tree);
}
