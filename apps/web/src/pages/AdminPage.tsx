// /admin — instance-wide console (v0.6 §5).
//
// Server gates every endpoint independently; this page renders a 403 banner
// when /api/me reports isAdmin=false. Admins can:
//   • Courses: list, create, delete (cascade per §"Course delete cascade").
//   • Admins:  promote (by email, must have signed in once) or demote.
//              Self-demotion is blocked server-side.
//   • Users:   read-only list with sign-in / enrollment summary.
//   • Audit:   append-only log of admin actions.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createAdminCourse,
  deleteAdminCourse,
  getMe,
  listAdmins,
  listAdminCourses,
  listAdminUsers,
  listAuditLog,
  promoteAdmin,
  type AdminCourse,
  type AdminEntry,
  type AdminUser,
  type AuditEntry,
} from "../client.js";
import { relativeTime } from "../time.js";

type Tab = "courses" | "admins" | "users" | "audit";

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("courses");
  const [meUserId, setMeUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        setMeUserId(m.userId);
        // getMe in v0.6 returns isAdmin; the mock's narrower MeResponse type
        // doesn't include it, so this cast keeps the page renderable in
        // mock mode (where it will just show 403).
        setIsAdmin(Boolean((m as { isAdmin?: boolean }).isAdmin));
      })
      .catch(() => setIsAdmin(false));
    return () => ctrl.abort();
  }, []);

  if (isAdmin === null) {
    return (
      <div className="page">
        <div className="card">
          <p>Loading…</p>
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="page">
        <div className="card">
          <h1>Admin</h1>
          <p className="error">You don't have access to this page.</p>
          <p><Link to="/">← Home</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="page staff">
      <div className="staff-frame">
        <header className="card-header">
          <h1>Admin</h1>
          <div className="header-actions">
            <Link to="/" className="link-button subtle">← Home</Link>
          </div>
        </header>
        <p className="scope-note">
          Everyone who has signed in to this instance, plus instance-wide
          controls. Each row links into a per-user page where role and admin
          status are managed.
        </p>
        <div className="tab-row" role="tablist">
          {(["courses", "admins", "users", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`tab-button${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
              type="button"
            >
              {t === "audit" ? "Audit log" : t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {tab === "courses" && <CoursesTab />}
        {tab === "admins" && <AdminsTab meUserId={meUserId} />}
        {tab === "users" && <UsersTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}

function CoursesTab() {
  const [courses, setCourses] = useState<AdminCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  function reload() {
    setError(null);
    listAdminCourses()
      .then((r) => setCourses(r.courses))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }
  useEffect(reload, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createAdminCourse(draft.trim());
      setDraft("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }
  async function onDelete(course: AdminCourse) {
    if (
      !window.confirm(
        `Delete course "${course.name}"?\n\nThis removes every agent, ` +
        `collection, source, join code, and enrollment. Student transcripts ` +
        `are preserved as orphaned rows but become unreachable through the ` +
        `app. This action cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAdminCourse(course.id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="field-group">
      <h2>Courses</h2>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={onCreate}>
        <input
          type="text"
          placeholder="New course name"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          {busy ? "Working…" : "Create course"}
        </button>
      </form>
      {courses === null ? (
        <p className="muted">Loading…</p>
      ) : courses.length === 0 ? (
        <p className="muted">No courses yet.</p>
      ) : (
        <ul className="assignment-list">
          {courses.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <div className="muted small">
                  {c.enrollmentCount}{" "}
                  {c.enrollmentCount === 1 ? "enrollment" : "enrollments"}
                  {" · created "}{relativeTime(c.createdAt)} · {c.id}
                </div>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="danger-link"
                  disabled={busy}
                  onClick={() => onDelete(c)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdminsTab({ meUserId }: { meUserId: string | null }) {
  const [admins, setAdmins] = useState<AdminEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  function reload() {
    setError(null);
    listAdmins()
      .then((r) => setAdmins(r.admins))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }
  useEffect(reload, []);

  async function onPromote(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await promoteAdmin(draft.trim().toLowerCase());
      setDraft("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="field-group">
      <h2>Admins</h2>
      <p className="muted small">
        Admins can create / delete courses, promote other admins, and view
        every user. Promote-by-email only works for users who have signed in
        at least once. To revoke admin, open the user.
      </p>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={onPromote}>
        <input
          type="email"
          placeholder="someone@example.edu"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          {busy ? "Working…" : "Promote"}
        </button>
      </form>
      {admins === null ? (
        <p className="muted">Loading…</p>
      ) : admins.length === 0 ? (
        <p className="muted">
          No admins. Bootstrap one via the INSTANCE_ADMIN_EMAILS env var.
        </p>
      ) : (
        <ul className="assignment-list">
          {admins.map((a) => {
            const isSelf = meUserId === a.userId;
            return (
              <li key={a.userId}>
                <div>
                  <strong>{a.email}</strong>
                  {isSelf && <span className="muted small"> · you</span>}
                  {a.displayName && (
                    <span className="muted small"> · {a.displayName}</span>
                  )}
                  <div className="muted small">
                    {a.lastSeenAt
                      ? <>Last seen {relativeTime(a.lastSeenAt)}</>
                      : <>Never signed in</>}
                  </div>
                </div>
                <div className="row-actions">
                  <Link
                    to={`/users/${a.userId}`}
                    className="link-button subtle"
                  >
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminUsers()
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  return (
    <section className="field-group">
      <h2>Users</h2>
      {error && <p className="error">{error}</p>}
      {users === null ? (
        <p className="muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="muted">No users yet.</p>
      ) : (
        <ul className="assignment-list">
          {users.map((u) => (
            <li key={u.userId}>
              <div>
                <strong>{u.email}</strong>
                {u.isAdmin && <span className="history-pill"> admin</span>}
                {u.displayName && (
                  <span className="muted small"> · {u.displayName}</span>
                )}
                <div className="muted small">
                  {u.enrollmentCount} enrollment
                  {u.enrollmentCount === 1 ? "" : "s"}
                  {" · "}
                  {u.lastSeenAt
                    ? <>Last seen {relativeTime(u.lastSeenAt)}</>
                    : <>Never signed in</>}
                  {u.externalProvider && <> · via {u.externalProvider}</>}
                </div>
              </div>
              <div className="row-actions">
                <Link
                  to={`/users/${u.userId}`}
                  className="link-button subtle"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAuditLog()
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  return (
    <section className="field-group">
      <h2>Audit log</h2>
      {error && <p className="error">{error}</p>}
      {entries === null ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="muted">No entries yet.</p>
      ) : (
        <ul className="assignment-list">
          {entries.map((e) => (
            <li key={e.id}>
              <div>
                <strong>{e.action}</strong>
                <div className="muted small">
                  {relativeTime(e.createdAt)}
                  {e.targetKind && e.targetId && (
                    <> · {e.targetKind}={e.targetId}</>
                  )}
                  {e.payload !== null && (
                    <> · {JSON.stringify(e.payload)}</>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
