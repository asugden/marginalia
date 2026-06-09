// Full conversation-history page (v0.4 §5). The conversation sidebar is
// capped at 10 rows with a "See all" link here; the landing page intentionally
// has no inline history so it stays a clean entry point. This page is where
// every past session lives, flat and recency-ordered.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listConversations, type ConversationSummary } from "../client.js";
import { relativeTime } from "../time.js";
import { Avatar, Badge, Button, Wordmark } from "../components/index.js";
import { BackIcon } from "../icons.js";

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

  const navigate = useNavigate();

  return (
    <div className="ds-home">
      <header className="ds-topbar">
        <div className="ds-topbar__inner">
          <Wordmark />
          <div className="ds-topbar__actions">
            <Button variant="ghost" size="sm" icon={<BackIcon size={16} />} href="/">
              <span className="ds-hide-sm">Home</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="ds-home__inner">
        <div className="ds-home__head">
          <span className="eyebrow">Your conversations</span>
          <span className="ds-rule" />
          <h1>History</h1>
        </div>

        {error && <p className="error">{error}</p>}

        {conversations === null ? (
          <p className="ds-home__muted">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="ds-home__muted">
            No conversations yet. <Link to="/">Pick an agent</Link> to get
            started.
          </p>
        ) : (
          <div className="ds-agents">
            {conversations.map((c) => (
              <div
                key={c.id}
                className="ds-agent"
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/c/${c.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/c/${c.id}`);
                }}
              >
                <Avatar name={c.agentName || rowTitle(c)} agent />
                <div className="ds-agent__main">
                  <div className="ds-agent__title">{rowTitle(c)}</div>
                  <div className="ds-agent__meta">
                    {c.agentName && (
                      <span className="ds-agent__topics" style={{ paddingLeft: 0 }}>
                        {c.agentName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ds-agent__action" style={{ width: "auto" }}>
                  {c.completedAt !== null ? (
                    <Badge tone="success" dot>
                      Completed
                    </Badge>
                  ) : (
                    <span className="ds-agent__topics" style={{ paddingLeft: 0 }}>
                      {relativeTime(c.updatedAt)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
