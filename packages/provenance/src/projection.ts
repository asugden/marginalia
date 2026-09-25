// The plain-text projection of a rich-text document, and the coordinate system
// event logs use.
//
// Replay (render.ts) tracks one origin per character of plain text. For that
// to line up, the editor must log edits in the SAME coordinates the server
// replays against: offsets into this projection, not the rich-text editor's
// internal positions. The two differ at every block boundary. A paragraph
// break is two editor positions (close + open) but one "\n" here, and text
// starts at editor position 1 but offset 0. Logging editor positions made
// every paragraph add a phantom character, so origins slid off their words and
// long documents reported length drift.
//
// The rule: text nodes contribute their text; each block in NEWLINE_BLOCKS
// contributes one "\n" after its content. Nothing else contributes anything.
// Editors walk their live document with these rules (see the writing tool's
// textCoords.ts); the server applies projectDocJson to the saved JSON. Change
// the rule in one place and both follow.

export const NEWLINE_BLOCKS: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "listItem",
  "blockquote",
]);

interface JsonNode {
  type?: string;
  text?: string;
  content?: unknown[];
}

/**
 * Project a saved document (ProseMirror/Tiptap JSON) to plain text. Unlike a
 * display projection it keeps trailing newlines: every character here is a
 * position an edit event can address.
 */
export function projectDocJson(node: unknown): string {
  let out = "";
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const obj = n as JsonNode;
    if (obj.type === "text" && typeof obj.text === "string") {
      out += obj.text;
      return;
    }
    if (Array.isArray(obj.content)) for (const child of obj.content) visit(child);
    if (obj.type && NEWLINE_BLOCKS.has(obj.type)) out += "\n";
  };
  visit(node);
  return out;
}
