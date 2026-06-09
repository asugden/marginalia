// Public, unauthenticated viewer for a shared submission at /s/:token.
// Renders the frozen provenance render (text + run-length origin spans)
// with the same color vocabulary as the editor, plus a light, opt-in
// drill-down into the chat history behind the document.
//
// No auth, no course context — a plain fetch of the public endpoints.

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  getPublicSubmission,
  getPublicSubmissionConversations,
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
            <h2>Link unavailable</h2>
            <p className="ds-home__note">{error}</p>
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
          <span className="prov-legend-item"><span className="prov-legend-swatch legend-llm" /> from chat</span>
          <span className="prov-legend-item"><span className="prov-legend-swatch legend-edited" /> edited</span>
        </div>
      </header>

      <article className="prov-public-doc">
        <RenderedDoc render={render} />
      </article>

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

/** Render the run-length provenance spans over the snapshot text. Splits
 *  the flat text into lines so paragraph breaks survive. */
function RenderedDoc({ render }: { render: ProvenanceRenderDTO }) {
  const out: ReactNode[] = [];
  let pos = 0;
  let key = 0;
  for (const run of render.runs) {
    const slice = render.text.slice(pos, pos + run.length);
    pos += run.length;
    const parts = slice.split("\n");
    parts.forEach((part, i) => {
      if (part.length > 0) {
        out.push(
          <span key={key++} data-origin={run.origin}>{part}</span>,
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
