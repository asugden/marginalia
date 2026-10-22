// Origin marks on rendered Markdown.
//
//   npx tsx src/markdownOrigins.test.ts

import { rehypeOrigins, type HastNode } from "./markdownOrigins.js";

let failures = 0;
let checks = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`ok    ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${e}\n      actual   ${a}`);
  }
}

/** A text node as react-markdown hands it over: value + source offsets. */
const text = (value: string, start: number): HastNode => ({
  type: "text",
  value,
  position: { start: { offset: start }, end: { offset: start + value.length } },
});
/** The node list as `origin:text`, human text bare. */
const flat = (nodes: HastNode[]): string[] =>
  nodes.map((n) =>
    n.type === "text"
      ? n.value!
      : `${String((n.properties!.className as string[])[0]).replace("code-origin--", "")}:${n.children![0]!.value}`,
  );
const run = (source: string, runs: Parameters<typeof rehypeOrigins>[1], tree: HastNode) => {
  rehypeOrigins(source, runs)()(tree);
  return tree;
};

{
  // "# Title" → <h1>Title</h1>: the text node starts after the "# " syntax.
  const source = "# Title";
  const tree = { type: "root", children: [{ type: "element", tagName: "h1", children: [text("Title", 2)] }] };
  run(source, [{ origin: "provided", length: 7 }], tree);
  check("formatting is kept and the text is marked", flat(tree.children[0]!.children!), ["provided:Title"]);
}

{
  // One text node spanning typed, pasted, then typed text is split at the run edges.
  const source = "I wrote this and pasted that then more";
  const tree = { type: "root", children: [{ type: "element", tagName: "p", children: [text(source, 0)] }] };
  run(source, [{ origin: "human", length: 17 }, { origin: "pasted", length: 11 }, { origin: "human", length: 10 }], tree);
  check("a node is split where origins change; typed text stays bare", flat(tree.children[0]!.children!), [
    "I wrote this and ",
    "pasted:pasted that",
    " then more",
  ]);
}

{
  // **bold** across a run boundary: each inline element's text is marked on its own.
  const source = "typed **from llm**";
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        children: [text("typed ", 0), { type: "element", tagName: "strong", children: [text("from llm", 8)] }],
      },
    ],
  };
  run(source, [{ origin: "human", length: 6 }, { origin: "llm", length: 12 }], tree);
  const p = tree.children[0]!.children!;
  check("text before the bold is bare", flat([p[0]!]), ["typed "]);
  check("text inside the bold is marked", flat(p[1]!.children!), ["llm:from llm"]);
}

{
  // An escaped character: the node's value isn't a verbatim slice of the source.
  const source = "a \\* b";
  const tree = { type: "root", children: [{ type: "element", tagName: "p", children: [{ ...text("a * b", 0), position: { start: { offset: 0 }, end: { offset: 6 } } }] }] };
  run(source, [{ origin: "pasted", length: 6 }], tree);
  check("a non-verbatim node takes its first character's origin", flat(tree.children[0]!.children!), ["pasted:a * b"]);
}

{
  // Nodes without positions (KaTeX output) are left untouched.
  const tree = { type: "root", children: [{ type: "text", value: "x²" }] };
  run("$x^2$", [{ origin: "llm", length: 5 }], tree);
  check("nodes without source positions are untouched", flat(tree.children), ["x²"]);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
