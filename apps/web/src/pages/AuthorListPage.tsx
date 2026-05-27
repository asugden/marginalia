// Instructor index of agents for the current course. From here you create a
// new one or jump into an existing one to edit.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteAgent, listAgents, type AgentSummary } from "../client.js";
import { DEMO_COURSE } from "../course.js";

export function AuthorListPage() {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function reload() {
    listAgents(DEMO_COURSE)
      .then((r) => setAgents(r.agents))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }

  useEffect(() => {
    reload();
  }, []);

  // v0.5 §7: Delete affordance. The server enforces instructor-only; we don't
  // hide the button for TAs in the UI today because /api/me doesn't surface
  // role yet. A TA who clicks gets the 403 surfaced as the error banner.
  async function onDelete(a: AgentSummary) {
    if (
      !window.confirm(
        `Delete agent "${a.title}"? Past conversations against this agent ` +
          `remain visible (read-only) but cannot be restarted.`,
      )
    ) {
      return;
    }
    setDeletingId(a.id);
    setError(null);
    try {
      await deleteAgent(DEMO_COURSE, a.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page staff">
      <div className="staff-frame">
        <header className="card-header">
          <h1>Agents</h1>
          <div className="header-actions">
            <Link to="/" className="link-button subtle">
              ← Student view
            </Link>
            <Link to="/author/voices" className="link-button subtle">
              Voices
            </Link>
            <Link to="/author/collections" className="link-button subtle">
              Collections
            </Link>
            <Link to="/author/roster" className="link-button subtle">
              Roster
            </Link>
            <Link to="/attendance" className="link-button subtle">
              Attendance
            </Link>
            <Link to="/author/agents/new" className="link-button">
              New agent
            </Link>
          </div>
        </header>

        {error && <p className="error">{error}</p>}

        {agents === null ? (
          <p className="muted">Loading…</p>
        ) : agents.length === 0 ? (
          <p className="muted">
            No agents yet.{" "}
            <Link to="/author/agents/new">Create the first one</Link>.
          </p>
        ) : (
          <ul className="assignment-list">
            {agents.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>{a.title}</strong>
                  <span className="muted small">
                    {" "}
                    · {a.hasBackbone ? "guided" : "free-form"}
                    {a.hasCollection ? " · grounded" : ""}
                  </span>
                </div>
                <div className="row-actions">
                  <Link
                    to={`/author/agents/${a.id}`}
                    className="link-button subtle"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="danger-link"
                    disabled={deletingId === a.id}
                    onClick={() => onDelete(a)}
                    aria-label={`Delete ${a.title}`}
                    title="Delete agent"
                  >
                    {deletingId === a.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
