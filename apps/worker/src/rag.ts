// RAG indexing + retrieval. Workers AI BGE for embeddings (pluggable later via
// a provider interface), Vectorize for storage, R2 for original files.
//
// Vectorize is namespaced per collection: `collection:{id}`. That keeps queries
// strictly within one collection and gives a clean unit for delete-by-namespace
// if a collection is ever wiped.
//
// PDF parsing is pluggable: parsePdf takes raw bytes → text. v0.4 uses
// unpdf (modern serverless pdfjs build) loaded dynamically only on the
// indexing path. Layout-aware chunking is a later step.

import type { Env } from "./env.js";

/** ~500 tokens, 50 token overlap, character-approximated (1 token ≈ 4 chars). */
const CHUNK_SIZE_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;

/** Vectorize batch ceiling; conservative to stay well under the 1000 row limit. */
const INSERT_BATCH = 100;

/** Top-k for retrieval. Tuned in plan; small enough that the prompt stays focused. */
export const RAG_TOP_K = 6;

/**
 * Minimum cosine score for a retrieved chunk to be sent to the model. The BGE
 * embedding model returns scores roughly in [0, 1]; matches below this are
 * usually off-topic and only inflate per-turn input tokens. Tune empirically
 * if students report "the textbook clearly says X but the agent missed it" —
 * but defaulting to a floor beats stuffing six unrelated chunks into every
 * turn when the student asked about something the corpus doesn't cover.
 */
export const RAG_MIN_SCORE = 0.5;

export const collectionNamespace = (collectionId: string) =>
  `collection:${collectionId}`;

/**
 * Vectorize has no Miniflare-style local emulator: `wrangler dev` will refuse
 * the binding with "Binding VECTORIZE needs to be run remotely." Until a real
 * production index exists (or someone wires up `wrangler dev --remote` for
 * the binding), short-circuit RAG in dev with a clear, user-facing message.
 *
 * Returns true when RAG can run, false (or throws, depending on caller) when
 * it cannot. Centralized here so we don't sprinkle env checks across callers.
 */
export function ragDisabledReason(env: Env): string | null {
  if (env.ENVIRONMENT === "dev") {
    return "RAG is disabled in local dev (Vectorize has no local emulator). Deploy, or run wrangler dev with --remote bindings, to exercise the collection path.";
  }
  return null;
}

export interface Chunk {
  index: number;
  text: string;
}

/**
 * Naive character-window chunker. Splits on paragraph breaks where possible
 * to avoid mid-sentence cuts, but falls back to hard windows when a paragraph
 * is enormous. Good enough for v0.2; layout-aware comes later.
 */
export function chunkText(raw: string): Chunk[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!text) return [];

  const chunks: Chunk[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < text.length) {
    const end = Math.min(cursor + CHUNK_SIZE_CHARS, text.length);
    let cut = end;
    if (end < text.length) {
      // Prefer to cut at a paragraph or sentence boundary within the last
      // 20% of the window so chunks read as coherent passages.
      const window = text.slice(cursor + Math.floor(CHUNK_SIZE_CHARS * 0.8), end);
      const paragraphBreak = window.lastIndexOf("\n\n");
      const sentenceBreak = window.lastIndexOf(". ");
      const offset =
        paragraphBreak >= 0 ? paragraphBreak + 2
        : sentenceBreak >= 0 ? sentenceBreak + 2
        : -1;
      if (offset > 0) {
        cut = cursor + Math.floor(CHUNK_SIZE_CHARS * 0.8) + offset;
      }
    }
    const slice = text.slice(cursor, cut).trim();
    if (slice) {
      chunks.push({ index, text: slice });
      index++;
    }
    if (cut >= text.length) break;
    cursor = Math.max(cut - CHUNK_OVERLAP_CHARS, cursor + 1);
  }
  return chunks;
}

/**
 * Strip common YAML front-matter and collapse whitespace. Markdown is
 * otherwise passed through as-is — the chunker handles paragraph splitting
 * downstream, and headings stay legible to the model in plain text.
 */
export function parseMarkdown(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");
  // Strip a leading `---\n...\n---\n` front-matter block, if present.
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---\n", 4);
    if (end !== -1) text = text.slice(end + 5);
  }
  return text.trim();
}

/**
 * Extract the main readable content from an HTML document.
 *
 * Workers can't run `jsdom` (too much DOM surface + Node-only APIs); the
 * combination of `linkedom` (parses HTML into a DOM-like tree without Node
 * deps) and `@mozilla/readability` (the same algorithm Firefox Reader View
 * uses) works in the Workers isolate without `nodejs_compat` tricks.
 *
 * Falls back to the document title + visible text if Readability declines
 * the page (login walls, very short pages, etc.). Returns trimmed plain
 * text; the caller chunks/embeds it like any other text source.
 */
export async function extractHtml(html: string, url?: string): Promise<string> {
  const { parseHTML } = await import("linkedom");
  const { Readability } = await import("@mozilla/readability");
  const dom = parseHTML(html);
  // Readability mutates the document in place; pass the linkedom document
  // through with a `documentURI` for relative-link resolution if available.
  // The Workers global `Document` type doesn't exist (it's browser-only); we
  // cast through `any` to satisfy Readability's structural expectations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = dom.document as any;
  if (url) {
    try {
      // linkedom doesn't expose a setter for documentURI; fall back to
      // adding a <base href> so Readability's URL resolution still works.
      const base = dom.document.createElement("base");
      base.setAttribute("href", url);
      dom.document.head?.appendChild(base);
    } catch {
      // best-effort; not load-bearing.
    }
  }
  const article = new Readability(doc).parse();
  if (article?.textContent && article.textContent.trim()) {
    return article.textContent.trim();
  }
  // Fallback: title + body text. Better than nothing.
  const title = dom.document.title ?? "";
  const body = dom.document.body?.textContent ?? "";
  return (title + "\n\n" + body).trim();
}

/**
 * Parse a PDF buffer to plain text.
 *
 * Uses `unpdf` (modern pdfjs-dist serverless build) rather than `pdf-parse-fork`,
 * which ships a 2018-vintage pdf.js that overflows the V8 call stack on
 * Workers (V8 spreads byte arrays via String.fromCharCode.apply during stream
 * decoding; ~64K args is the ceiling). unpdf's serverless bundle avoids the
 * recursive code paths and Node-Buffer dependency, so it works in the Workers
 * isolate without nodejs_compat tricks.
 *
 * Dynamic import keeps the parser off the chat-path cold start.
 */
export async function parsePdf(bytes: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  // mergePages:true returns text as a single concatenated string.
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/**
 * Concrete kind after sniffing a URL fetch. We deliberately *never* route a
 * URL through the PDF parser: even when the link is to arXiv, the
 * abstract page is text-rich HTML and Readability extracts the title +
 * abstract at near-zero cost, where pulling the full PDF would mean parsing
 * tens of pages of LaTeX-rendered prose just to find the same text.
 * Markdown and plain text are passthroughs.
 */
export type FetchedKind = "markdown" | "text";

export interface FetchedUrl {
  bytes: ArrayBuffer;
  contentType: string;
  /** Concrete kind after sniffing — never "url" once fetched. */
  kind: FetchedKind;
  /** Final URL after redirects, for the row. */
  finalUrl: string;
}

/**
 * Refuse hostnames that name a private/loopback/link-local address literally.
 *
 * Workers don't run in a VPC, so loopback/RFC1918 aren't typically reachable —
 * but an instructor on a CGNAT'd ISP, a VPN-tunneled corporate network with a
 * public DNS entry for an internal host, or a site behind a custom resolver
 * can still cause the Worker to pull from somewhere it shouldn't. We block
 * the literal-IP cases here as defense in depth; the protocol check above
 * already rules out file://, and we walk redirects manually below so a 302
 * → http://10.0.0.1 can't slip past this gate.
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata.google.internal") return true;
  // IPv4 literal
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const o = v4.slice(1, 5).map(Number) as [number, number, number, number];
    if (o.some((n) => n > 255)) return true;
    if (o[0] === 10) return true;                                   // 10.0.0.0/8
    if (o[0] === 127) return true;                                  // 127.0.0.0/8
    if (o[0] === 0) return true;                                    // 0.0.0.0/8
    if (o[0] === 169 && o[1] === 254) return true;                  // link-local + IMDS
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;      // 172.16.0.0/12
    if (o[0] === 192 && o[1] === 168) return true;                  // 192.168.0.0/16
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;     // CGNAT 100.64.0.0/10
    if (o[0] >= 224) return true;                                   // multicast + reserved
    return false;
  }
  // IPv6 literal (after the [] strip above)
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;      // ULA fc00::/7
    if (h.startsWith("fe80:") || h.startsWith("fe8") || h.startsWith("fe9") ||
        h.startsWith("fea") || h.startsWith("feb")) return true;     // link-local fe80::/10
    if (h.startsWith("ff")) return true;                             // multicast
    // ::ffff:a.b.c.d (IPv4-mapped) — extract and re-check
    const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
    if (mapped) return isBlockedHost(mapped[1]!);
    return false;
  }
  return false;
}

/**
 * Fetch a URL with a hard size+time cap, sniff content-type, and report which
 * downstream parser the bytes should flow through. Caller handles R2 storage
 * and indexing. Throws with a user-readable message on any failure mode.
 *
 * Redirects are walked manually (max 5 hops) so the SSRF host check runs on
 * every hop, not just the first one. A 302 → http://10.0.0.1 from a public
 * host would otherwise bypass the gate.
 */
export async function fetchUrl(
  rawUrl: string,
  maxBytes: number,
): Promise<FetchedUrl> {
  const MAX_HOPS = 5;
  let current = rawUrl;
  let res!: Response;
  for (let hop = 0; ; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new Error("Invalid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http(s) URLs are allowed");
    }
    if (isBlockedHost(parsed.hostname)) {
      throw new Error(
        `Refusing to fetch ${parsed.hostname}: private, loopback, or link-local addresses are not allowed.`,
      );
    }
    res = await fetch(current, {
      headers: { "User-Agent": "marginalia-collection-indexer/0.4" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    // 3xx with a Location header → re-check the next hop's host before following.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      if (hop >= MAX_HOPS) throw new Error("Too many redirects");
      // Resolve relative redirects against the current URL.
      current = new URL(loc, current).toString();
      continue;
    }
    break;
  }
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const declaredLength = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(
      `Resource is ${declaredLength} bytes; the per-source cap is ${maxBytes}.`,
    );
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `Resource is ${bytes.byteLength} bytes; the per-source cap is ${maxBytes}.`,
    );
  }
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  // URLs always resolve into text. HTML is routed through Readability so its
  // chrome / nav / footers don't pollute the corpus; markdown and text/* pass
  // through. PDFs at a URL are deliberately *not* supported: parsing a remote
  // PDF on every refresh is wasteful when the same paper's abstract page is a
  // few KB of HTML that Readability handles instantly. If an instructor truly
  // wants the PDF body, they upload it.
  let kind: FetchedKind;
  if (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml")
  ) {
    kind = "markdown"; // routed through HTML extractor before indexing
  } else if (contentType.includes("text/markdown")) {
    kind = "markdown";
  } else if (
    contentType.includes("text/plain") ||
    contentType.startsWith("text/")
  ) {
    kind = "text";
  } else if (contentType.includes("application/pdf")) {
    throw new Error(
      "PDF URLs are not supported — upload the PDF directly, or link to its HTML abstract / landing page.",
    );
  } else {
    throw new Error(
      `Unsupported content-type "${contentType || "unknown"}" — only HTML, markdown, and plain text URLs are supported.`,
    );
  }
  // With redirect:"manual", res.url is the URL we actually issued the final
  // request to — `current` after the redirect walk. Fall back to the original
  // input if the runtime didn't populate it.
  return {
    bytes,
    contentType,
    kind,
    finalUrl: res.url || current,
  };
}

/**
 * Turn fetched bytes into plain text by kind. For HTML/markdown we route
 * through the appropriate extractor; for PDFs we hand off to parsePdf.
 */
export async function bytesToText(
  bytes: ArrayBuffer,
  _kind: FetchedKind,
  contentType: string,
  finalUrl?: string,
): Promise<string> {
  const text = new TextDecoder("utf-8").decode(bytes);
  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    return extractHtml(text, finalUrl);
  }
  if (contentType.includes("text/markdown")) return parseMarkdown(text);
  return text.trim();
}

/** Run the configured embedding model over a batch of strings. */
export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  // Workers AI typings are heavily overloaded per-model id; we keep the call
  // site loose so swapping EMBEDDING_MODEL is a config change, not a code change.
  const ai = env.AI as unknown as {
    run: (model: string, input: { text: string[] }) => Promise<{ data: number[][] }>;
  };
  const res = await ai.run(env.EMBEDDING_MODEL, { text: texts });
  if (!res?.data || !Array.isArray(res.data)) {
    throw new Error("Embedding model returned no data");
  }
  return res.data;
}

/**
 * Tiny module-level cache for query embeddings. A student who hits send,
 * cancels, and re-sends the same text inside one isolate's lifetime gets the
 * second embedding for free. BGE on Workers AI is cheap individually but the
 * call is a real round-trip and trivially repeatable. We cap entries with a
 * simple FIFO eviction; the cache is per-isolate (not shared across regions
 * or restarts) which is good enough for redundancy elimination.
 */
const QUERY_EMBED_CACHE = new Map<string, number[]>();
const QUERY_EMBED_CACHE_MAX = 128;

async function embedQuery(env: Env, query: string): Promise<number[] | null> {
  const cached = QUERY_EMBED_CACHE.get(query);
  if (cached) return cached;
  const [vector] = await embed(env, [query]);
  if (!vector) return null;
  if (QUERY_EMBED_CACHE.size >= QUERY_EMBED_CACHE_MAX) {
    // FIFO eviction: drop the oldest key. Map preserves insertion order.
    const firstKey = QUERY_EMBED_CACHE.keys().next().value;
    if (firstKey !== undefined) QUERY_EMBED_CACHE.delete(firstKey);
  }
  QUERY_EMBED_CACHE.set(query, vector);
  return vector;
}

/**
 * Index one source: chunk → embed → insert. Caller persists status + chunk
 * count on the collection_sources row. Throws on the first failure; the caller
 * marks the row "failed" with the error message.
 *
 * `maxChunks` is an absolute upper bound on chunks produced from this source.
 * Bounds the embedding-API cost of a single upload; a malicious or careless
 * upload of a multi-thousand-page PDF cannot translate into thousands of
 * embed calls without first refusing the upload.
 */
export async function indexSource(
  env: Env,
  params: {
    collectionId: string;
    sourceId: string;
    text: string;
    maxChunks?: number;
  },
): Promise<{ chunks: number }> {
  const disabled = ragDisabledReason(env);
  if (disabled) throw new Error(disabled);

  const all = chunkText(params.text);
  if (all.length === 0) return { chunks: 0 };
  if (params.maxChunks !== undefined && all.length > params.maxChunks) {
    throw new Error(
      `Source produced ${all.length} chunks; the per-source cap is ${params.maxChunks}. Split the document into smaller files.`,
    );
  }
  const chunks = all;

  const namespace = collectionNamespace(params.collectionId);
  let inserted = 0;

  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const batch = chunks.slice(i, i + INSERT_BATCH);
    const vectors = await embed(env, batch.map((c) => c.text));
    if (vectors.length !== batch.length) {
      throw new Error(
        `Embedding count mismatch: ${vectors.length} vs ${batch.length}`,
      );
    }
    const rows: VectorizeVector[] = batch.map((c, k) => ({
      id: `${params.sourceId}:${c.index}`,
      values: vectors[k]!,
      namespace,
      metadata: {
        collection_id: params.collectionId,
        source_id: params.sourceId,
        chunk_idx: c.index,
        text: c.text.slice(0, 4000),
      },
    }));
    await env.VECTORIZE.upsert(rows);
    inserted += rows.length;
  }
  return { chunks: inserted };
}

export interface Retrieved {
  sourceId: string;
  chunkIdx: number;
  text: string;
  score: number;
}

/** Top-k retrieval within one collection namespace. */
export async function retrieve(
  env: Env,
  collectionId: string,
  query: string,
  topK = RAG_TOP_K,
  minScore = RAG_MIN_SCORE,
): Promise<Retrieved[]> {
  // Quietly skip when Vectorize is unavailable (local dev). postMessage's
  // catch will fall through to ungrounded answering; no need to spam logs.
  if (ragDisabledReason(env)) return [];

  const vector = await embedQuery(env, query);
  if (!vector) return [];
  const res = await env.VECTORIZE.query(vector, {
    topK,
    namespace: collectionNamespace(collectionId),
    returnMetadata: "all",
  });
  // Filter by minimum relevance score so a query unrelated to the corpus
  // doesn't stuff six low-confidence chunks into every turn — that's pure
  // wasted input tokens, billed to whoever holds the Anthropic key.
  return (res.matches ?? [])
    .filter((m) => m.score >= minScore)
    .map((m) => {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      return {
        sourceId: String(meta.source_id ?? ""),
        chunkIdx: Number(meta.chunk_idx ?? 0),
        text: String(meta.text ?? ""),
        score: m.score,
      };
    });
}

/**
 * Render retrieved chunks as a system-prompt context block. The model is told
 * to cite with [^source-id] when it relies on a chunk; downstream UI can later
 * map those tokens to richer source cards.
 */
export function formatRetrievedContext(chunks: Retrieved[]): string {
  if (chunks.length === 0) {
    return [
      "## Retrieved sources",
      "No relevant sources were retrieved for this turn. Answer from the conversation only; if you cannot, say so plainly.",
    ].join("\n");
  }
  const lines = [
    "## Retrieved sources",
    "Use these passages to ground your reply. When you draw on one, cite it inline as `[^source-id]` using the SourceId shown for the passage. Do not invent citations. If the passages don't cover the question, say so.",
    "",
  ];
  for (const c of chunks) {
    lines.push(`### SourceId: ${c.sourceId} (chunk ${c.chunkIdx})`);
    lines.push(c.text);
    lines.push("");
  }
  return lines.join("\n");
}
