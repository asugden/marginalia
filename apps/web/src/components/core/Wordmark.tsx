// Wordmark — the header brand lockup: an optional mark image + the wordmark
// text, with a contiguous run of characters painted in the accent colour. The
// run is `accentLen` characters starting at `accentStart` (0-based, default 0),
// so a deploy can pick out a leading prefix OR a mid-word run of its name as
// the chroma.
//
// Both the wordmark string and the mark image come from the brand config
// (theme.yaml via the Vite theme plugin), so the public/default build shows a
// neutral product name with no mark, and a branded deploy supplies its own
// wordmark + mark by setting brand.wordmark / brand.wordmark_accent_start /
// brand.wordmark_accent_len / brand.mark_url. No brand name is ever hardcoded here.

const WORDMARK = import.meta.env.BRAND_WORDMARK;
const ACCENT_START = Number(import.meta.env.BRAND_WORDMARK_ACCENT_START) || 0;
const ACCENT_LEN = Number(import.meta.env.BRAND_WORDMARK_ACCENT_LEN) || 0;
const MARK_URL = import.meta.env.BRAND_MARK_URL;

type WordmarkProps = {
  /** Visual size of the lockup. */
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function Wordmark({ size = "md", className = "" }: WordmarkProps) {
  // Split the wordmark into pre · accent · post so the accent run can sit
  // anywhere in the word (a leading prefix when accentStart is 0, or a mid-word
  // run otherwise). accentLen 0 → no accent, whole word plain.
  const accentEnd = ACCENT_START + ACCENT_LEN;
  const pre = WORDMARK.slice(0, ACCENT_START);
  const accent = ACCENT_LEN > 0 ? WORDMARK.slice(ACCENT_START, accentEnd) : "";
  const post = WORDMARK.slice(accentEnd);
  // Emits the design-system `.app-lockup` markup so the wordmark is identical
  // wherever it appears (every topbar). Size modifiers map to the DS lockup.
  const cls = ["app-lockup", size !== "md" ? `app-lockup--${size}` : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      {MARK_URL && <img className="app-lockup__mark" src={MARK_URL} alt="" aria-hidden />}
      <span className="app-lockup__word">
        {pre}
        {accent && <em>{accent}</em>}
        {post}
      </span>
    </span>
  );
}
