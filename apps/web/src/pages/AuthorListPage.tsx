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
import { Avatar, Badge, Button, IconButton } from "../components/index.js";
import { PlusIcon, TrashIcon } from "../icons.js";

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
      navigate(`/course/${courseId}/instructor/agents/${r.id}`);
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
    <div className="app-page">
      <div className="app-page__head">
        <div>
          <span className="eyebrow">Instructor · Agents</span>
          <h1>Agents</h1>
          <div className="app-page__scope">
            AI tutors your students can chat with — each carries a voice and,
            optionally, an outline of topics or a library of sources.
          </div>
        </div>
        <div className="app-page__actions">
          <Button variant="ghost" href="/author/voices">
            Voices
          </Button>
          <Button variant="subtle" icon={<PlusIcon size={16} />} onClick={openPicker}>
            From another course
          </Button>
          <Button
            variant="primary"
            icon={<PlusIcon size={16} />}
            href={`/course/${courseId}/instructor/agents/new`}
          >
            New agent
          </Button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {agents === null ? (
        <p className="muted">Loading…</p>
      ) : agents.length === 0 ? (
        <p className="muted">
          You haven&rsquo;t built any agents yet.{" "}
          <Link to={`/course/${courseId}/instructor/agents/new`}>Make the first one</Link>.
          An agent is a tutor your students can chat with — a voice, optionally
          an outline of topics, and optionally a library of sources to ground
          its answers.
        </p>
      ) : (
        <div className="app-list">
          {agents.map((a) => (
            <div className="app-list__row" key={a.id}>
              <Avatar name={a.title} agent={a.hasBackbone} />
              <div className="app-list__main">
                <div className="app-list__title">{a.title}</div>
                <div
                  className="app-list__sub"
                  style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}
                >
                  <Badge tone={a.hasBackbone ? "brand" : "ghost"}>
                    {a.hasBackbone ? "outline" : "open"}
                  </Badge>
                  {a.hasCollection && (
                    <Badge tone="info" dot>
                      grounded
                    </Badge>
                  )}
                </div>
              </div>
              <div className="app-list__meta">
                <Button
                  variant="subtle"
                  size="sm"
                  href={`/course/${courseId}/instructor/agents/${a.id}`}
                >
                  Edit
                </Button>
                <IconButton
                  variant="ghost"
                  size="sm"
                  title="Delete agent"
                  disabled={deletingId === a.id}
                  onClick={() => onDelete(a)}
                >
                  <TrashIcon size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Copy agent from another course"
          onClick={() => setPickerOpen(false)}
          className="app-modal-backdrop"
        >
          <div onClick={(e) => e.stopPropagation()} className="app-modal">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
              }}
            >
              <span className="mono-label">Copy from another course</span>
              <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
                Close
              </Button>
            </div>
            <p className="muted small">
              Pick any agent you instruct in another course; we&rsquo;ll create
              an independent copy here. The voice comes along. A course-local
              library is dropped — you can pick a new one in the next step.
            </p>
            {pickerError && <p className="error">{pickerError}</p>}
            {pickerGroups === null ? (
              <p className="muted">Loading…</p>
            ) : otherCourseGroups.length === 0 ? (
              <p className="muted">
                You don&rsquo;t instruct any other courses with agents to copy.
              </p>
            ) : (
              otherCourseGroups.map((g) => (
                <div key={g.courseId} style={{ marginTop: "1.25rem" }}>
                  <h3 className="mono-label" style={{ marginBottom: "0.5rem" }}>
                    {g.courseName}
                  </h3>
                  {g.agents.length === 0 ? (
                    <p className="muted small">No agents in this course.</p>
                  ) : (
                    <div className="app-list">
                      {g.agents.map((a) => (
                        <div className="app-list__row" key={a.id}>
                          <div className="app-list__main">
                            <div className="app-list__title">{a.title}</div>
                            <div
                              className="app-list__sub"
                              style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}
                            >
                              <Badge tone={a.hasBackbone ? "brand" : "ghost"}>
                                {a.hasBackbone ? "outline" : "open"}
                              </Badge>
                              {a.hasCollection && (
                                <Badge tone="info" dot>
                                  grounded
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="app-list__meta">
                            <Button
                              variant="subtle"
                              size="sm"
                              disabled={duplicatingId === a.id}
                              loading={duplicatingId === a.id}
                              onClick={() => onDuplicate(a.id, a.title)}
                            >
                              Copy here
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
