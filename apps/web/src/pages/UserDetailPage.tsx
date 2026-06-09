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
import { Avatar, Badge, Button, Select, Wordmark } from "../components/index.js";

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

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="ds-staff">
      <header className="ds-staff-top">
        <Link to="/" aria-label="Home">
          <Wordmark size="sm" />
        </Link>
        <span className="ds-staff-top__role">Admin</span>
        <div className="ds-staff-top__course">
          <Button variant="ghost" size="sm" href="/admin">
            ← Admin
          </Button>
        </div>
      </header>
      <div className="ds-staff-page">{children}</div>
    </div>
  );

  if (error && !detail) {
    return (
      <Shell>
        <p className="error">{error}</p>
      </Shell>
    );
  }
  if (!detail) {
    return (
      <Shell>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }

  const u = detail.user;
  const isSelf = meUserId === u.userId;

  return (
    <Shell>
      <div className="ds-staff-head">
        <div style={{ display: "flex", gap: "0.9rem", alignItems: "center" }}>
          <Avatar name={u.displayName || u.email} size="lg" />
          <div>
            <span className="eyebrow">User</span>
            <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {u.displayName || u.email}
              {u.isAdmin && <Badge tone="brand">admin</Badge>}
            </h1>
            <div className="ds-staff-head__scope">
              {u.email}
              {" · "}
              {u.lastSeenAt
                ? `last seen ${relativeTime(u.lastSeenAt)}`
                : "never signed in"}
              {u.externalProvider ? ` · via ${u.externalProvider}` : ""}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="ds-staff-section">
        <span className="mono-label ds-staff-section__label">Instance admin</span>
        <div
          style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}
        >
          {u.isAdmin ? (
            <>
              <span className="muted small" style={{ flex: 1, minWidth: "12rem" }}>
                Can create / delete courses, manage admins, and view every user.
              </span>
              <Button
                variant="danger"
                size="sm"
                disabled={busy || isSelf}
                title={isSelf ? "You can't revoke your own admin." : undefined}
                onClick={onDemote}
              >
                Revoke admin
              </Button>
            </>
          ) : (
            <>
              <span className="muted small" style={{ flex: 1, minWidth: "12rem" }}>
                Not an instance admin.
              </span>
              <Button variant="primary" size="sm" disabled={busy} loading={busy} onClick={onPromote}>
                Promote to admin
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="ds-staff-section">
        <span className="mono-label ds-staff-section__label">Courses</span>
        {detail.enrollments.length === 0 ? (
          <p className="muted">Not enrolled in any course.</p>
        ) : (
          <div className="ds-roster">
            {detail.enrollments.map((e) => (
              <div className="ds-roster__row" key={e.courseId}>
                <div className="ds-roster__person">
                  <div style={{ minWidth: 0 }}>
                    <div className="ds-roster__name">{e.courseName}</div>
                    <div className="ds-roster__email">
                      Joined {relativeTime(e.joinedAt)} · {e.courseId}
                    </div>
                  </div>
                </div>
                <span className="ds-roster__meta" />
                <div className="ds-roster__actions">
                  <Select
                    value={e.role}
                    disabled={busy || isSelf}
                    title={isSelf ? "You can't change your own role." : undefined}
                    onChange={(ev) =>
                      onChangeRole(
                        e.courseId,
                        e.role,
                        ev.target.value as EnrollmentRole,
                      )
                    }
                  >
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                  </Select>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy || isSelf}
                    title={
                      isSelf ? "Ask another instructor to remove you." : undefined
                    }
                    onClick={() => onRemove(e.courseId, e.courseName)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ds-staff-section">
        <span className="mono-label ds-staff-section__label">Recent activity</span>
        {detail.audit.length === 0 ? (
          <p className="muted">No audit entries.</p>
        ) : (
          <div className="ds-staff-list">
            {detail.audit.map((a) => {
              const isActor = a.actorId === u.userId;
              return (
                <div className="ds-staff-list__row" key={a.id}>
                  <div className="ds-staff-list__main">
                    <div className="ds-staff-list__title">
                      {a.action}{" "}
                      <Badge tone="ghost">{isActor ? "actor" : "target"}</Badge>
                    </div>
                    <div className="ds-staff-list__sub">
                      {relativeTime(a.createdAt)}
                      {a.targetKind && a.targetId
                        ? ` · ${a.targetKind}=${a.targetId}`
                        : ""}
                      {a.payload !== null ? ` · ${JSON.stringify(a.payload)}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
