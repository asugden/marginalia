// Full conversation-history page (v0.4 §5). The conversation sidebar is
// capped at 10 rows with a "See all" link here; the landing page intentionally
// has no inline history so it stays a clean entry point. This page is where
// every past session lives, flat and recency-ordered.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listConversations, type ConversationSummary } from "../client.js";
import { useCourse } from "../course/useCourse.js";
import { relativeTime } from "../time.js";
import { Badge } from "../components/index.js";

function rowTitle(c: ConversationSummary): string {
  // Backbone rows already arrive titled by the server ("Agent — topic 2/4" /
  // "Agent — completed"). Free-chat rows have either an LLM-generated title
  // or an empty string while the lazy generation is still pending.
  return c.title || "Untitled";
}

export function HistoryPage() {
  const { courseId } = useCourse();
  const base = `/course/${courseId}`;
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
    <div className="app-history">
      <div className="app-head">
        <span className="eyebrow">Your conversations</span>
        <span className="app-rule" />
        <h1>Your history</h1>
        <p className="app-head__sub">
          Every conversation you&rsquo;ve had — pick one up where you left off.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      {conversations === null ? (
        <p className="app-empty">Loading…</p>
      ) : conversations.length === 0 ? (
        <p className="app-empty">
          No conversations yet. <Link to={base}>Pick an agent</Link> to get
          started.
        </p>
      ) : (
        <ul className="app-history__list">
          {conversations.map((c) => (
            <li key={c.id}>
              <a
                href={`${base}/chat/${c.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`${base}/chat/${c.id}`);
                }}
              >
                <span className="app-history__h">{rowTitle(c)}</span>
                <span
                  style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}
                >
                  {c.completedAt !== null ? (
                    <Badge tone="success" dot>
                      done
                    </Badge>
                  ) : (
                    c.agentName && <Badge tone="ghost">{c.agentName}</Badge>
                  )}
                  <span className="app-history__when">
                    {relativeTime(c.updatedAt)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
