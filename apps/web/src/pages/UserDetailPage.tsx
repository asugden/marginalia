// /users/:id — per-user detail view (v0.7 §3.8).
//
// The primitive that Admin Users and Roster (Students + Authors) both link
// into. Shows: identity + instance-admin badge, every course enrollment
// (with role + joined-at), and a recent audit slice involving this user as
// actor or target.
//
// Admin-only on the server today. Editing controls (promote/demote, change
// enrollment role, remove from course) call the existing endpoints; this
// page is the one place those controls live now.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  demoteAdmin,
  getAdminUser,
  getMe,
  patchRosterEntry,
  promoteAdmin,
  removeRosterEntry,
  type EnrollmentRole,
  type UserDetail,
} from "../client.js";
import { relativeTime } from "../time.js";

export function UserDetailPage() {
  const { id: userId } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meUserId, setMeUserId] = useState<string | null>(null);

  function reload() {
    if (!userId) return;
    setError(null);
    getAdminUser(userId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }

  useEffect(reload, [userId]);
  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (!ctrl.signal.aborted) setMeUserId(m.userId);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  async function onPromote() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await promoteAdmin(detail.user.email);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setBusy(false);
    }
  }
  async function onDemote() {
    if (!detail) return;
    if (!window.confirm(`Revoke admin from ${detail.user.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await demoteAdmin(detail.user.userId);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demote failed");
    } finally {
      setBusy(false);
    }
  }
  async function onChangeRole(
    courseId: string,
    currentRole: EnrollmentRole,
    nextRole: EnrollmentRole,
  ) {
    if (!detail) return;
    if (currentRole === nextRole) return;
    if (currentRole === "instructor" && nextRole === "student") {
      if (!window.confirm(`Downgrade ${detail.user.email} to student on this course?`)) return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchRosterEntry(courseId, detail.user.userId, nextRole);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }
  async function onRemove(courseId: string, courseName: string) {
    if (!detail) return;
    if (!window.confirm(`Remove ${detail.user.email} from ${courseName}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeRosterEntry(courseId, detail.user.userId);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) {
    return (
      <div className="page staff">
        <div className="staff-frame">
          <p className="error">{error}</p>
          <p><Link to="/admin">← Admin</Link></p>
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="page staff">
        <div className="staff-frame">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  const u = detail.user;
  const isSelf = meUserId === u.userId;

  return (
    <div className="page staff">
      <div className="staff-frame">
        <header className="card-header">
          <h1>
            {u.displayName || u.email}
            {u.isAdmin && <span className="history-pill"> admin</span>}
          </h1>
          <div className="header-actions">
            <Link to="/admin" className="link-button subtle">← Admin</Link>
          </div>
        </header>
        <p className="scope-note">
          {u.email}
          {u.displayName && <> · {u.displayName}</>}
          {" · "}
          {u.lastSeenAt
            ? <>last seen {relativeTime(u.lastSeenAt)}</>
            : <>never signed in</>}
          {u.externalProvider && <> · via {u.externalProvider}</>}
        </p>

        {error && <p className="error">{error}</p>}

        <section className="field-group">
          <h2>Instance admin</h2>
          {u.isAdmin ? (
            <div className="row-actions">
              <span className="muted small">
                Can create / delete courses, manage admins, and view every user.
              </span>
              <button
                type="button"
                className="danger-link"
                disabled={busy || isSelf}
                title={isSelf ? "You can't revoke your own admin." : undefined}
                onClick={onDemote}
              >
                Revoke admin
              </button>
            </div>
          ) : (
            <div className="row-actions">
              <span className="muted small">Not an instance admin.</span>
              <button type="button" disabled={busy} onClick={onPromote}>
                {busy ? "Working…" : "Promote to admin"}
              </button>
            </div>
          )}
        </section>

        <section className="field-group">
          <h2>Courses</h2>
          {detail.enrollments.length === 0 ? (
            <p className="muted">Not enrolled in any course.</p>
          ) : (
            <ul className="assignment-list">
              {detail.enrollments.map((e) => (
                <li key={e.courseId}>
                  <div>
                    <strong>{e.courseName}</strong>
                    <div className="muted small">
                      Joined {relativeTime(e.joinedAt)} · {e.courseId}
                    </div>
                  </div>
                  <div className="row-actions">
                    <select
                      value={e.role}
                      disabled={busy || isSelf}
                      title={isSelf ? "You can't change your own role." : undefined}
                      onChange={(ev) =>
                        onChangeRole(e.courseId, e.role, ev.target.value as EnrollmentRole)
                      }
                    >
                      <option value="student">Student</option>
                      <option value="instructor">Instructor</option>
                    </select>
                    <button
                      type="button"
                      className="danger-link"
                      disabled={busy || isSelf}
                      title={isSelf ? "Ask another instructor to remove you." : undefined}
                      onClick={() => onRemove(e.courseId, e.courseName)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="field-group">
          <h2>Recent activity</h2>
          {detail.audit.length === 0 ? (
            <p className="muted">No audit entries.</p>
          ) : (
            <ul className="assignment-list">
              {detail.audit.map((a) => {
                const isActor = a.actorId === u.userId;
                return (
                  <li key={a.id}>
                    <div>
                      <strong>{a.action}</strong>
                      <span className="muted small">
                        {" "}· {isActor ? "as actor" : "as target"}
                      </span>
                      <div className="muted small">
                        {relativeTime(a.createdAt)}
                        {a.targetKind && a.targetId && (
                          <> · {a.targetKind}={a.targetId}</>
                        )}
                        {a.payload !== null && (
                          <> · {JSON.stringify(a.payload)}</>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
