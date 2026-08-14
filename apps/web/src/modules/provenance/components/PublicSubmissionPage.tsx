// Viewer for a shared submission at /s/:token. Renders the frozen provenance
// render (text + run-length origin spans) with the same color vocabulary as the
// editor, plus a light, opt-in drill-down into the chat history behind it.
//
// **Instructor-only.** This page used to be unauthenticated so a link could be
// handed to anyone. It isn't: origin classification is incomplete, so a student
// who could open their own render would learn which spans were attributed to the
// LLM and could iterate until the page looked clean. The server requires an
// instructor enrollment in the submission's course and returns 404 for everyone
// else, so this component only renders the frozen snapshot or an unavailable card.

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  getPublicSubmission,
  getPublicSubmissionConversations,
  SUBMISSION_SIGN_IN_REQUIRED,
  type PasteRecordDTO,
  type ProvenanceAuditDTO,
  type ProvenanceRenderDTO,
  type PublicConversationDTO,
} from "../api.js";
import { Button, Wordmark } from "../../../components/index.js";

export function PublicSubmissionPage() {
  const { token } = useParams<{ token: string }>();
  const [title, setTitle] = useState<string>("");
  const [render, setRender] = useState<ProvenanceRenderDTO | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showChat, setShowChat] = useState(false);
  const [convs, setConvs] = useState<PublicConversationDTO[] | null>(null);
  const [convError, setConvError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    getPublicSubmission(token, ctrl.signal)
      .then((s) => {
        if (ctrl.signal.aborted) return;
        setTitle(s.title);
        setRender(s.render);
        setCreatedAt(s.createdAt);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "This link is unavailable");
      });
    return () => ctrl.abort();
  }, [token]);

  async function loadConversations() {
    if (!token) return;
    setShowChat(true);
    if (convs !== null) return;
    try {
      const c = await getPublicSubmissionConversations(token);
      setConvs(c);
    } catch (e) {
      setConvError(e instanceof Error ? e.message : "Could not load conversations");
    }
  }

  if (error) {
    const needsSignIn = error === SUBMISSION_SIGN_IN_REQUIRED;
    return (
      <div className="ds-home">
        <header className="ds-topbar">
          <div className="ds-topbar__inner">
            <Wordmark />
          </div>
        </header>
        <div className="ds-home__inner">
          <div className="ds-home__panel ds-join__card">
            <span className="eyebrow">Shared document</span>
            <span className="ds-rule" />
            {needsSignIn ? (
              <>
                <h2>Sign in to view</h2>
                <p className="ds-home__note">
                  Shared writing snapshots are visible to course instructors.
                </p>
                <Button
                  href={`/auth/login?return_to=${encodeURIComponent(`/s/${token ?? ""}`)}`}
                >
                  Sign in
                </Button>
              </>
            ) : (
              <>
                <h2>Link unavailable</h2>
                <p className="ds-home__note">{error}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!render) {
    return <div className="ds-home" />;
  }

  return (
    <div className="prov-public">
      <header className="prov-public-header">
        <div className="prov-public-titles">
          <div style={{ marginBottom: "0.6rem" }}>
            <Wordmark size="sm" />
          </div>
          <h1>{title || "Untitled"}</h1>
          {createdAt && (
            <p className="muted small">
              Shared snapshot · {new Date(createdAt).toLocaleDateString(undefined, {
                month: "long", day: "numeric", year: "numeric",
              })}
            </p>
          )}
        </div>
        <div className="prov-public-legend" aria-label="Word-origin legend">
          <span className="prov-legend-item"><span className="prov-legend-swatch legend-human" /> typed</span>
          <span className="prov-legend-item"><span className="prov-legend-swatch legend-pasted" /> pasted</span>
          <span className="prov-legend-item"><span className="prov-legend-swatch legend-llm" /> from LLM</span>
          <span className="prov-legend-item"><span className="prov-legend-swatch legend-edited" /> autocorrect</span>
        </div>
      </header>

      <article className="prov-public-doc">
        <RenderedDoc render={render} />
      </article>

      <PasteList pastes={render.pastes} />
      <HistoryPanel audit={render.audit} />

      <section className="prov-public-chat">
        {!showChat ? (
          <Button variant="subtle" size="sm" onClick={loadConversations}>
            Show chat history
          </Button>
        ) : (
          <>
            <h2 className="prov-public-chat-heading">Chat history</h2>
            {convError && <p className="error">{convError}</p>}
            {convs === null && <p className="muted">Loading…</p>}
            {convs !== null && convs.length === 0 && (
              <p className="muted">No chat conversations on this document.</p>
            )}
            {convs?.map((c) => (
              <details key={c.id} className="prov-public-conv">
                <summary>
                  {c.title ?? "(untitled)"} <span className="muted small">· {c.agentName}</span>
                </summary>
                <div className="prov-public-conv-body">
                  {c.messages.map((m, i) => (
                    <div key={i} className={`prov-public-msg prov-public-msg-${m.role}`}>
                      <span className="prov-public-msg-role">{m.role === "user" ? "Student" : c.agentName}</span>
                      <div className="prov-public-msg-content">{m.content}</div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </>
        )}
      </section>
    </div>
  );
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function duration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/**
 * Clipboard imports, in order, with how much of each survives.
 *
 * This is the surface that answers "what if they pasted model prose and then
 * rewrote it until the coloring went away". A per-character origin map cannot
 * show that — once the text is reworded there is nothing left to color. The
 * paste list can, because it is append-only history rather than a property of
 * the current text: a passage that was imported and then reworked shows LOW
 * verbatim and HIGH near-match, which is the pattern worth a human look.
 *
 * Deliberately descriptive. No score, no flag, no threshold that turns a row
 * red. The instructor reads the source text and decides what it means.
 */
function PasteList({ pastes }: { pastes?: PasteRecordDTO[] }) {
  // Pre-slice-8 snapshots have no inventory. Say so rather than implying
  // the student pasted nothing.
  if (!pastes) {
    return (
      <section className="prov-public-pastes">
        <h2 className="prov-public-chat-heading">Pasted content</h2>
        <p className="muted small">
          This snapshot was taken before paste history was recorded.
        </p>
      </section>
    );
  }
  return (
    <section className="prov-public-pastes">
      <h2 className="prov-public-chat-heading">
        Pasted content{pastes.length > 0 ? ` (${pastes.length})` : ""}
      </h2>
      {pastes.length === 0 ? (
        <p className="muted small">Nothing was pasted into this document.</p>
      ) : (
        <>
          <p className="muted small prov-public-note">
            Text brought in from the clipboard, in the order it arrived — including
            text that was later deleted or rewritten. “Still present” counts what
            remains word-for-word; “reworded” estimates how much survives in
            different words. Both are lexical measures: a thorough rewrite scores
            low on each.
          </p>
          <ol className="prov-paste-list">
            {pastes.map((p) => (
              <li key={p.seq} className="prov-paste-item">
                <div className="prov-paste-meta">
                  <span className="prov-paste-when">
                    {new Date(p.at).toLocaleString(undefined, {
                      month: "short", day: "numeric",
                      hour: "numeric", minute: "2-digit",
                    })}
                  </span>
                  <span className="muted small">
                    {p.length.toLocaleString()} characters
                  </span>
                  <span className="muted small">
                    {pct(p.verbatim)} still present · {pct(p.nearMatch)} reworded
                  </span>
                </div>
                <blockquote className="prov-paste-sample">{p.sample}</blockquote>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/**
 * How the document was written, as measured from the event log.
 *
 * Every line here is an observation with its ordinary explanation attached.
 * That is not padding — a reader who arrives suspicious will read any bare
 * number as confirmation, so the innocent reading has to be in the same
 * sentence as the fact.
 *
 * The panel renders even when everything is unremarkable, on purpose: a panel
 * that appears only when something is wrong would itself be an accusation, and
 * its mere presence would do the accusing before anyone read a word.
 */
function HistoryPanel({ audit }: { audit?: ProvenanceAuditDTO }) {
  if (!audit) return null;
  const notes: string[] = [];

  if (audit.longestGapMs > 20 * 60_000) {
    notes.push(
      `Longest stretch with no connection: ${duration(audit.longestGapMs)} ` +
        `(writing offline, a dropped connection, or a closed laptop).`,
    );
  }
  if (audit.finalSessionShare > 0.8 && audit.sessions > 1) {
    notes.push(
      `${pct(audit.finalSessionShare)} of the surviving text arrived in the ` +
        `last session (a single long session, or drafting elsewhere and typing it up).`,
    );
  }
  if (audit.fastBursts > 0) {
    notes.push(
      `${audit.fastBursts} burst${audit.fastBursts === 1 ? "" : "s"} of input ` +
        `faster than typing (dictation, autocomplete, or an assistive input device).`,
    );
  }
  if (audit.lengthDrift > 200) {
    notes.push(
      `${audit.lengthDrift.toLocaleString()} characters of the document aren't ` +
        `accounted for by the recorded events (most often a batch lost on a ` +
        `flaky connection).`,
    );
  }
  if (audit.unverifiedMoves > 0) {
    notes.push(
      `${audit.unverifiedMoves} block${audit.unverifiedMoves === 1 ? "" : "s"} ` +
        `moved within the document without a matching cut (copying rather than ` +
        `cutting does this routinely).`,
    );
  }
  if (audit.orderingAnomalies > 0) {
    notes.push(
      `${audit.orderingAnomalies} event${audit.orderingAnomalies === 1 ? "" : "s"} ` +
        `arrived out of order (clock changes and offline sync do this).`,
    );
  }

  return (
    <section className="prov-public-history">
      <details>
        <summary className="prov-public-history-summary">
          Document history
          <span className="muted small">
            {" · "}
            {audit.sessions} session{audit.sessions === 1 ? "" : "s"}
            {audit.spanMs > 0 ? ` over ${duration(audit.spanMs)}` : ""}
          </span>
        </summary>
        <div className="prov-public-history-body">
          <dl className="prov-history-facts">
            <div><dt>Writing sessions</dt><dd>{audit.sessions}</dd></div>
            <div><dt>First to last edit</dt><dd>{duration(audit.spanMs)}</dd></div>
            <div><dt>Time connected</dt><dd>{duration(audit.activeMs)}</dd></div>
            <div><dt>Longest gap</dt><dd>{duration(audit.longestGapMs)}</dd></div>
          </dl>
          {notes.length > 0 && (
            <ul className="prov-history-notes">
              {notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          <p className="muted small prov-public-note">
            These are measurements of the edit log, not judgements about it.
            Any single observation here has an ordinary explanation; none of
            them means anything on its own.
          </p>
        </div>
      </details>
    </section>
  );
}

/**
 * Minimum run length before a clipboard-derived region gets a margin rule.
 * A pasted citation or URL is noise; a pasted paragraph is worth seeing.
 */
const MARGIN_RULE_MIN = 200;

/** Render the run-length provenance spans over the snapshot text. Splits
 *  the flat text into lines so paragraph breaks survive.
 *
 *  Substantial clipboard-derived regions also get a quiet rule in the left
 *  margin. It marks "this region has a history" — an invitation to look, not
 *  a claim about it — which is why it is a hairline rather than a status
 *  color. The paste list below carries the detail; this only says where. */
function RenderedDoc({ render }: { render: ProvenanceRenderDTO }) {
  const out: ReactNode[] = [];
  let pos = 0;
  let key = 0;
  for (const run of render.runs) {
    const slice = render.text.slice(pos, pos + run.length);
    pos += run.length;
    // `pasted` already covers text that was pasted and later retyped by hand —
    // the server folds those together at mint time.
    const marked = run.origin === "pasted" && run.length >= MARGIN_RULE_MIN;
    const parts = slice.split("\n");
    parts.forEach((part, i) => {
      if (part.length > 0) {
        out.push(
          <span
            key={key++}
            data-origin={run.origin}
            className={marked ? "prov-has-history" : undefined}
          >
            {part}
          </span>,
        );
      }
      if (i < parts.length - 1) out.push(<br key={key++} />);
    });
  }
  if (pos < render.text.length) {
    out.push(<span key={key++} data-origin="human">{render.text.slice(pos)}</span>);
  }
  return <div className="prov-public-render">{out}</div>;
}
