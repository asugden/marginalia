// Wordmark — the header brand lockup: an optional mark image + the wordmark
// text, with the leading `accentLen` characters painted in the accent colour.
//
// Both the wordmark string and the mark image come from the brand config
// (theme.yaml via the Vite theme plugin), so the public/default build shows a
// neutral product name with no mark, and a branded deploy supplies its own
// wordmark + mark by setting brand.wordmark / brand.wordmark_accent_len /
// brand.mark_url. No brand name is ever hardcoded here.

const WORDMARK = import.meta.env.BRAND_WORDMARK;
const ACCENT_LEN = Number(import.meta.env.BRAND_WORDMARK_ACCENT_LEN) || 0;
const MARK_URL = import.meta.env.BRAND_MARK_URL;

type WordmarkProps = {
  /** Visual size of the lockup. */
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function Wordmark({ size = "md", className = "" }: WordmarkProps) {
  const accent = WORDMARK.slice(0, ACCENT_LEN);
  const rest = WORDMARK.slice(ACCENT_LEN);
  const cls = ["ds-lockup", size !== "md" ? `ds-lockup--${size}` : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      {MARK_URL && <img className="ds-lockup__mark" src={MARK_URL} alt="" aria-hidden />}
      <span className="ds-lockup__word">
        {accent && <em>{accent}</em>}
        {rest}
      </span>
    </span>
  );
}
