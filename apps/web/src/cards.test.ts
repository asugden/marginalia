// Guards card consistency: anything assigned is listed through <ItemCard>,
// never with hand-built row markup, so no list can miss the icon tile or the
// whole-card link. Static checks over the source.
//
//   npx tsx src/cards.test.ts

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL(".", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

let failures = 0;
let checks = 0;
function check(label: string, offenders: string[]): void {
  checks++;
  if (offenders.length === 0) console.log(`ok    ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}\n      ${offenders.join("\n      ")}`);
  }
}

const sources = files(root).map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") }));

// <ItemMark> belongs inside <ItemCard>. The one exception is the student's
// agent card, a larger card with its own Start/Continue column.
const MARK_ALLOWED = new Set(["components/ItemCard.tsx", "pages/AgentsPanel.tsx", "pages/DesignGalleryPage.tsx"]);
check(
  "the kind mark is only rendered by ItemCard",
  sources.filter((s) => /<ItemMark\b/.test(s.text) && !MARK_ALLOWED.has(s.path)).map((s) => s.path),
);

// A card's main link is a .card-link, which is what makes the whole card
// clickable. ItemCard and SubmissionCards set it; a hand-written card-link
// elsewhere means a card is being built by hand.
const LINK_ALLOWED = new Set(["components/ItemCard.tsx", "components/SubmissionCards.tsx"]);
check(
  "card links come from the shared card components",
  sources.filter((s) => /card-link/.test(s.text) && !LINK_ALLOWED.has(s.path)).map((s) => s.path),
);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
