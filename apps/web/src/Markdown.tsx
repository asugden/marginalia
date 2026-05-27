// Assistant-message markdown renderer (v0.4 §12).
//
// Why a tiny wrapper instead of using <ReactMarkdown> inline at each call
// site: the plugin set + the link override + the className contract are
// load-bearing and easy to forget. One component, one consistent surface.
//
// Streaming-safe: react-markdown re-parses the input string on every render,
// and the chosen plugin set (gfm, math) tolerates unterminated fences / bold /
// math markers mid-token without throwing.

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
// KaTeX styles live with the renderer so they ride the lazy-loaded chunk.
import "katex/dist/katex.min.css";
import type { MessageSource } from "./api.js";

interface Props {
  children: string;
  /** v0.5 §3 — citations on this assistant message. When provided, the
   *  renderer replaces every `[^src_<id>]` token in the content with a
   *  numbered pill linking to the cited source. */
  citations?: MessageSource[];
  /** Builds the click-through URL for a citation. Null = the source can't
   *  be opened (e.g. deleted) and the pill renders as a disabled chip. */
  citationHref?: (c: MessageSource) => string | null;
}

const CITATION_TOKEN_RE = /\[\^?(src_[0-9a-f-]{36})\]/g;
const PILL_SCHEME = "marginalia-cite://";

export function Markdown({ children, citations, citationHref }: Props) {
  let content = children;
  const pillByOrdinal = new Map<number, MessageSource>();
  // v0.7 §3.5 — always strip un-pillable [^src_*] tokens. Pre-v0.5
  // conversations have no message_sources rows; without this branch the
  // raw bracketed token surfaces in the rendered output. Same code path
  // for the modern case: tokens with matching citations become pills,
  // tokens without (deleted source, pre-v0.5 transcript) are dropped.
  const byId = new Map((citations ?? []).map((c) => [c.sourceId, c]));
  for (const c of citations ?? []) pillByOrdinal.set(c.ordinal, c);
  content = content.replace(CITATION_TOKEN_RE, (_m, id: string) => {
    const c = byId.get(id);
    if (!c) return "";
    return `[${c.ordinal}](${PILL_SCHEME}${c.ordinal})`;
  });
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // External-link safety: every link opens in a new tab and severs
          // window.opener. No raw-HTML passthrough (react-markdown defaults
          // off; spelled out for the next reader).
          //
          // v0.5 §3 — pill links use a sentinel scheme so we can swap them
          // for a styled pill with the right click-through URL. Falls back
          // to a disabled chip when the underlying source has no link.
          a({ href, children: kids, ...rest }) {
            if (href?.startsWith(PILL_SCHEME)) {
              const ord = Number(href.slice(PILL_SCHEME.length));
              const c = pillByOrdinal.get(ord);
              if (c) {
                const real = citationHref ? citationHref(c) : null;
                if (!real) {
                  return (
                    <span
                      className="citation-pill disabled"
                      title={c.filename}
                    >
                      [{c.ordinal}]
                    </span>
                  );
                }
                return (
                  <a
                    href={real}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="citation-pill"
                    title={c.filename}
                  >
                    [{c.ordinal}]
                  </a>
                );
              }
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...rest}
              >
                {kids}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
