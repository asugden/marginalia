// Full conversation-history page (v0.4 §5). The conversation sidebar is
// capped at 10 rows with a "See all" link here; the landing page intentionally
// has no inline history so it stays a clean entry point. This page is where
// every past session lives, flat and recency-ordered.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listConversations, type ConversationSummary } from "../client.js";
import { relativeTime } from "../time.js";

function rowTitle(c: ConversationSummary): string {
  // Backbone rows already arrive titled by the server ("Agent — topic 2/4" /
  // "Agent — completed"). Free-chat rows have either an LLM-generated title
  // or an empty string while the lazy generation is still pending.
  return c.title || "Untitled";
}

export function HistoryPage() {
  const [conversations, setConversations] =
    useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listConversations()
      .then((r) => setConversations(r.conversations))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  return (
    <div className="page hero">
      <div className="card wide">
        <header className="card-header">
          <h1>History</h1>
          <Link to="/" className="link-button subtle">
            ← Home
          </Link>
        </header>

        {error && <p className="error">{error}</p>}

        {conversations === null ? (
          <p className="muted">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="muted">
            No conversations yet. <Link to="/">Pick an agent</Link> to get started.
          </p>
        ) : (
          <ul className="history-list">
            {conversations.map((c) => (
              <li key={c.id} className={c.completedAt !== null ? "done" : undefined}>
                <Link to={`/c/${c.id}`}>
                  <div className="history-line-top">
                    <span className="history-title">{rowTitle(c)}</span>
                    {c.completedAt !== null && (
                      <span className="history-pill">✓ Completed</span>
                    )}
                  </div>
                  <div className="history-line-bottom">
                    <span className="history-agent muted small">
                      {c.agentName}
                    </span>
                    <span
                      className="history-time muted small"
                      title={new Date(c.updatedAt).toLocaleString()}
                    >
                      {relativeTime(c.updatedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
