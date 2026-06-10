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
import {
  Avatar,
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  SegmentedControl,
  Wordmark,
} from "../components/index.js";
import { PlusIcon, SignOutIcon, TrashIcon } from "../icons.js";
import { signOut } from "../session.js";

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
      <div className="ds-staff">
        <div className="app-page">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="ds-staff">
        <header className="ds-staff-top">
          <Wordmark size="sm" />
          <span className="ds-staff-top__role">Admin</span>
        </header>
        <div className="app-page">
          <div className="app-page__head">
            <div>
              <span className="eyebrow">Admin</span>
              <h1>No access</h1>
            </div>
          </div>
          <p className="error">You don&rsquo;t have access to this page.</p>
          <Button variant="subtle" href="/">
            ← Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-staff">
      <header className="ds-staff-top">
        <Link to="/" aria-label="Home">
          <Wordmark size="sm" />
        </Link>
        <span className="ds-staff-top__role">Admin</span>
        <div className="ds-staff-top__course">
          <IconButton title="Sign out" onClick={signOut}>
            <SignOutIcon />
          </IconButton>
        </div>
      </header>
      <div className="app-page">
        <div className="app-page__head">
          <div>
            <span className="eyebrow">Instance</span>
            <h1>Admin</h1>
            <div className="app-page__scope">
              Everyone who has signed in to this instance, plus instance-wide
              controls. Each row links into a per-user page where role and admin
              status are managed.
            </div>
          </div>
        </div>
        <div className="app-section">
          <SegmentedControl
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { value: "courses", label: "Courses" },
              { value: "admins", label: "Admins" },
              { value: "users", label: "Users" },
              { value: "audit", label: "Audit log" },
            ]}
          />
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
    <div className="app-section">
      <span className="mono-label app-section__label">Courses</span>
      {error && <p className="error">{error}</p>}
      <form
        onSubmit={onCreate}
        style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "1rem" }}
      >
        <div style={{ flex: 1, maxWidth: "24rem" }}>
          <Field label="New course name">
            <Input
              type="text"
              placeholder="e.g. Stats 101"
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
            />
          </Field>
        </div>
        <Button
          type="submit"
          variant="primary"
          icon={<PlusIcon size={16} />}
          loading={busy}
          disabled={busy || !draft.trim()}
        >
          Create course
        </Button>
      </form>
      {courses === null ? (
        <p className="muted">Loading…</p>
      ) : courses.length === 0 ? (
        <p className="muted">No courses yet.</p>
      ) : (
        <div className="app-list">
          {courses.map((c) => (
            <div className="app-list__row" key={c.id}>
              <div className="app-list__main">
                <div className="app-list__title">{c.name}</div>
                <div className="app-list__sub">
                  {c.enrollmentCount}{" "}
                  {c.enrollmentCount === 1 ? "enrollment" : "enrollments"} ·
                  created {relativeTime(c.createdAt)} · {c.id}
                </div>
              </div>
              <div className="app-list__meta">
                <IconButton
                  variant="ghost"
                  size="sm"
                  title={`Delete course "${c.name}"`}
                  disabled={busy}
                  onClick={() => onDelete(c)}
                >
                  <TrashIcon size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
    <div className="app-section">
      <span className="mono-label app-section__label">Admins</span>
      <p className="muted small">
        Admins can create / delete courses, promote other admins, and view every
        user. Promote-by-email only works for users who have signed in at least
        once. To revoke admin, open the user.
      </p>
      {error && <p className="error">{error}</p>}
      <form
        onSubmit={onPromote}
        style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", margin: "1rem 0" }}
      >
        <div style={{ flex: 1, maxWidth: "24rem" }}>
          <Field label="Promote by email">
            <Input
              type="email"
              placeholder="someone@example.edu"
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
            />
          </Field>
        </div>
        <Button
          type="submit"
          variant="primary"
          loading={busy}
          disabled={busy || !draft.trim()}
        >
          Promote
        </Button>
      </form>
      {admins === null ? (
        <p className="muted">Loading…</p>
      ) : admins.length === 0 ? (
        <p className="muted">
          No admins. Bootstrap one via the INSTANCE_ADMIN_EMAILS env var.
        </p>
      ) : (
        <div className="app-list">
          {admins.map((a) => {
            const isSelf = meUserId === a.userId;
            return (
              <Link
                key={a.userId}
                to={`/users/${a.userId}`}
                className="app-list__row"
              >
                <Avatar name={a.displayName || a.email} />
                <div className="app-list__main">
                  <div className="app-list__title">
                    {a.email}
                    {isSelf && <span className="muted small"> · you</span>}
                  </div>
                  <div className="app-list__sub">
                    {a.lastSeenAt
                      ? `Last seen ${relativeTime(a.lastSeenAt)}`
                      : "Never signed in"}
                  </div>
                </div>
                <div className="app-list__meta">
                  <Badge tone="brand">admin</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
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
    <div className="app-section">
      <span className="mono-label app-section__label">Users</span>
      {error && <p className="error">{error}</p>}
      {users === null ? (
        <p className="muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="muted">No users yet.</p>
      ) : (
        <div className="app-list">
          {users.map((u) => (
            <Link
              key={u.userId}
              to={`/users/${u.userId}`}
              className="app-list__row"
            >
              <Avatar name={u.displayName || u.email} />
              <div className="app-list__main">
                <div className="app-list__title">
                  {u.email}
                  {u.isAdmin && (
                    <>
                      {" "}
                      <Badge tone="brand">admin</Badge>
                    </>
                  )}
                </div>
                <div className="app-list__sub">
                  {u.enrollmentCount} enrollment
                  {u.enrollmentCount === 1 ? "" : "s"} ·{" "}
                  {u.lastSeenAt
                    ? `Last seen ${relativeTime(u.lastSeenAt)}`
                    : "Never signed in"}
                  {u.externalProvider ? ` · via ${u.externalProvider}` : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
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
    <div className="app-section">
      <span className="mono-label app-section__label">Audit log</span>
      {error && <p className="error">{error}</p>}
      {entries === null ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="muted">No entries yet.</p>
      ) : (
        <div className="app-list">
          {entries.map((e) => (
            <div className="app-list__row" key={e.id}>
              <div className="app-list__main">
                <div className="app-list__title">{e.action}</div>
                <div className="app-list__sub">
                  {relativeTime(e.createdAt)}
                  {e.targetKind && e.targetId
                    ? ` · ${e.targetKind}=${e.targetId}`
                    : ""}
                  {e.payload !== null ? ` · ${JSON.stringify(e.payload)}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
