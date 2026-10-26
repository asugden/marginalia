// Every question session in the course, newest first. Mounted in both shells:
// students see the sessions that have been opened; staff also see drafts and
// can create, open, close, rename and delete sessions.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, PageHeader, Section, useConfirm } from "../../../components/index.js";
import { createSession, deleteSession, listSessions, updateSession, type SessionDTO } from "../api.js";
import { SessionCard } from "./cards.js";
import { sessionPath } from "./paths.js";
import { CreateForm, RenameForm } from "./RenameForm.js";
import { usePoll } from "./usePoll.js";

export function SessionsPage({ staffShell = false }: { staffShell?: boolean }) {
  const { courseId = "" } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionDTO[] | null>(null);
  const [staff, setStaff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const reload = useCallback(() => {
    listSessions(courseId)
      .then((r) => {
        setSessions(r.sessions);
        setStaff(r.staff);
      })
      .catch((e) => setError((e as Error).message));
  }, [courseId]);

  useEffect(reload, [reload]);
  usePoll(reload, 20_000);

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (s: SessionDTO) => {
    const ok = await confirm({
      title: `Delete “${s.title}”?`,
      body: "Its boards and every question on them will be deleted too.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) await act(() => deleteSession(s.id));
  };

  const controls = staffShell && staff;

  return (
    <div className={staffShell ? "ds-staff-page" : "app-page"}>
      <PageHeader
        eyebrow={staffShell ? "Instructor · Review" : "Questions"}
        title={staffShell ? "Questions" : "Question sessions"}
        scope={
          controls
            ? "A session is one class meeting, with a board for each presenter. Open the session and everyone in the course is prompted to ask questions on any of its boards; they appear for the whole class without names."
            : "Questions for each presenter, by class session. Everyone sees them; nobody sees who asked."
        }
      />

      {controls && (
        <Section kicker="New session">
          <CreateForm
            label="Session name"
            placeholder="e.g. Presentations — Day 1"
            onCreate={(t) =>
              // Straight into the new session, where its boards are added.
              act(async () => {
                const s = await createSession(courseId, t);
                navigate(sessionPath(courseId, staffShell, s.id));
              })
            }
          />
        </Section>
      )}

      {error && <p className="error">{error}</p>}

      <Section kicker="Sessions" meta={sessions ? String(sessions.length) : undefined}>
        {sessions === null ? (
          <p className="muted">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="muted">
            {controls
              ? "No sessions yet."
              : "No sessions yet. When one opens in class, a button will appear to take you to it."}
          </p>
        ) : (
          <div className="app-list">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                href={renaming === s.id ? null : sessionPath(courseId, staffShell, s.id)}
                title={
                  renaming === s.id ? (
                    <RenameForm
                      initial={s.title}
                      onSave={async (t) => {
                        await act(() => updateSession(s.id, { title: t }));
                        setRenaming(null);
                      }}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : undefined
                }
                meta={
                  controls &&
                  renaming !== s.id && (
                    <span className="q-row__actions">
                      {s.status === "open" ? (
                        <Button variant="subtle" size="sm" onClick={() => act(() => updateSession(s.id, { status: "closed" }))}>
                          Close
                        </Button>
                      ) : (
                        <Button variant="subtle" size="sm" onClick={() => act(() => updateSession(s.id, { status: "open" }))}>
                          {s.status === "draft" ? "Open" : "Reopen"}
                        </Button>
                      )}
                      <Button variant="subtle" size="sm" onClick={() => setRenaming(s.id)}>
                        Rename
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => remove(s)}>
                        Delete
                      </Button>
                    </span>
                  )
                }
              />
            ))}
          </div>
        )}
      </Section>
      {dialog}
    </div>
  );
}
