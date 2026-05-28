// Instructor index of agents for the current course. From here you create a
// new one, jump into an existing one to edit, or pull a copy of an agent
// you've authored in another course (v1.0 §4 copy-on-use model — the copy
// is independent of the source).
//
// v1.0 Phase 2: the page header lives in CourseLayout. This component
// renders only the body — list, modal, primary "New agent" action.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  deleteAgent,
  duplicateAgentTo,
  listAgents,
  listDuplicableAgents,
  type AgentSummary,
  type DuplicableAgentsGroup,
} from "../client.js";
import { useCourse } from "../course/useCourse.js";

export function AuthorListPage() {
  const { courseId } = useCourse();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerGroups, setPickerGroups] = useState<DuplicableAgentsGroup[] | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  function reload() {
    listAgents(courseId)
      .then((r) => setAgents(r.agents))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [courseId]);

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
      await deleteAgent(courseId, a.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function openPicker() {
    setPickerOpen(true);
    setPickerError(null);
    if (pickerGroups !== null) return;
    listDuplicableAgents()
      .then((r) => setPickerGroups(r.courses))
      .catch((e) =>
        setPickerError(e instanceof Error ? e.message : "Load failed"),
      );
  }

  async function onDuplicate(sourceAgentId: string, sourceTitle: string) {
    setDuplicatingId(sourceAgentId);
    setPickerError(null);
    try {
      const r = await duplicateAgentTo(sourceAgentId, courseId);
      const msg = r.droppedCollection
        ? `Copied "${sourceTitle}". The source library isn't in this course; pick a new one (or leave empty).`
        : `Copied "${sourceTitle}".`;
      if (r.droppedCollection) window.alert(msg);
      setPickerOpen(false);
      navigate(`/course/${courseId}/agents/${r.id}`);
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setDuplicatingId(null);
    }
  }

  const otherCourseGroups = (pickerGroups ?? []).filter(
    (g) => g.courseId !== courseId,
  );

  return (
    <section>
      <div className="section-actions">
        <Link to="/author/voices" className="link-button subtle">
          Voices
        </Link>
        <button
          type="button"
          className="subtle"
          onClick={openPicker}
        >
          + From another course
        </button>
        <Link
          to={`/course/${courseId}/agents/new`}
          className="link-button"
        >
          New agent
        </Link>
      </div>

      {error && <p className="error">{error}</p>}

      {agents === null ? (
        <p className="muted">Loading…</p>
      ) : agents.length === 0 ? (
        <p className="muted">
          You haven't built any agents yet.{" "}
          <Link to={`/course/${courseId}/agents/new`}>Make the first one</Link>.
          An agent is a tutor your students can chat with — a voice, optionally
          an outline of topics, and optionally a library of sources to ground
          its answers.
        </p>
      ) : (
        <ul className="assignment-list">
          {agents.map((a) => (
            <li key={a.id}>
              <div>
                <strong>{a.title}</strong>
                <span className="muted small">
                  {" "}
                  · {a.hasBackbone ? "outline" : "open"}
                  {a.hasCollection ? " · grounded" : ""}
                </span>
              </div>
              <div className="row-actions">
                <Link
                  to={`/course/${courseId}/agents/${a.id}`}
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

      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Copy agent from another course"
          onClick={() => setPickerOpen(false)}
          className="modal-backdrop"
        >
          <div onClick={(e) => e.stopPropagation()} className="modal-card">
            <header className="card-header">
              <h2 style={{ margin: 0 }}>Copy from another course</h2>
              <button
                type="button"
                className="subtle"
                onClick={() => setPickerOpen(false)}
                aria-label="Close"
              >
                Close
              </button>
            </header>
            <p className="muted small">
              Pick any agent you instruct in another course; we'll create an
              independent copy here. The voice comes along. A course-local
              library is dropped — you can pick a new one in the next step.
            </p>
            {pickerError && <p className="error">{pickerError}</p>}
            {pickerGroups === null ? (
              <p className="muted">Loading…</p>
            ) : otherCourseGroups.length === 0 ? (
              <p className="muted">
                You don't instruct any other courses with agents to copy.
              </p>
            ) : (
              otherCourseGroups.map((g) => (
                <section key={g.courseId} className="field-group">
                  <h3 style={{ marginBottom: "0.5rem" }}>{g.courseName}</h3>
                  {g.agents.length === 0 ? (
                    <p className="muted small">No agents in this course.</p>
                  ) : (
                    <ul className="assignment-list">
                      {g.agents.map((a) => (
                        <li key={a.id}>
                          <div>
                            <strong>{a.title}</strong>
                            <span className="muted small">
                              {" "}
                              · {a.hasBackbone ? "outline" : "open"}
                              {a.hasCollection ? " · grounded" : ""}
                            </span>
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="subtle"
                              disabled={duplicatingId === a.id}
                              onClick={() => onDuplicate(a.id, a.title)}
                            >
                              {duplicatingId === a.id ? "Copying…" : "Copy here"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
