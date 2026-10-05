// The leading mark on a card for anything assigned: a square tile carrying
// the kind's icon. The icon says what it is; the tint only tells neighbours
// apart. The tint is hashed from a stable id (never the title or content),
// so an item keeps its colour across renames and on every page that lists it.
// Tones and sizes live in css/cards.css.

import { ChatIcon, CodeIcon, CursorIcon, DocIcon, WritingIcon } from "../icons.js";

export type ItemMarkKind = "writing" | "code" | "agent" | "example" | "reading";

const LABEL: Record<ItemMarkKind, string> = {
  writing: "Writing",
  code: "Code",
  agent: "Agent",
  example: "Example",
  reading: "Reading",
};

/** How many tones cards.css defines (`.card-mark--tone-0` …). */
const TONES = 5;

function toneFor(seed: string): number {
  // FNV-1a: cheap, stable, and well spread for short ids.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % TONES;
}

export function ItemMark({ kind, seed }: { kind: ItemMarkKind; seed: string }) {
  const Icon =
    kind === "writing"
      ? WritingIcon
      : kind === "code"
        ? CodeIcon
        : kind === "agent"
          ? ChatIcon
          : kind === "example"
            ? CursorIcon
            : DocIcon;
  return (
    <span
      className={`card-mark card-mark--tone-${toneFor(seed)}`}
      role="img"
      aria-label={LABEL[kind]}
      title={LABEL[kind]}
    >
      <Icon />
    </span>
  );
}
