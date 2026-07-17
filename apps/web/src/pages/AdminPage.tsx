// /admin — instance-wide console (v0.6 §5; chrome unified v1.1).
//
// Server gates every endpoint independently; this page renders a 403 banner
// when /api/me reports isAdmin=false. Admins can:
//   • Instructors: add / remove an instructor on a course by email. This used
//                  to live inside each course's People page; it lives here now
//                  so one screen owns who teaches what.
//   • Courses: list, create, delete (cascade per §"Course delete cascade").
//   • Admins:  promote (by email, must have signed in once) or demote.
//              Self-demotion is blocked server-side.
//   • Users:   read-only list with sign-in / enrollment summary.
//   • Audit:   append-only log of admin actions.
//
// The console wears the same `app-topbar` shell as the rest of the app (the
// admin register), not its own `ds-staff-top` chrome. It carries the RoleSwitch
// (current="admin") so an admin steps back to their instructor surface or a
// course preview from the header — there is no per-page back button.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addRosterEntry,
  createAdminCourse,
  deleteAdminCourse,
  demoteAdmin,
  getMe,
  listAdmins,
  listAdminCourses,
  listAdminUsers,
  listAuditLog,
  listRoster,
  promoteAdmin,
  removeRosterEntry,
  type AdminCourse,
  type AdminEntry,
  type AdminUser,
  type AuditEntry,
  type RosterEntry,
} from "../client.js";
import { relativeTime } from "../time.js";
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  Field,
  IconButton,
  Input,
  RoleSwitch,
  SegmentedControl,
  useConfirm,
  Wordmark,
} from "../components/index.js";
import { PlusIcon, SignOutIcon, TrashIcon } from "../icons.js";
import { signOut } from "../session.js";

type Tab = "instructors" | "courses" | "admins" | "users" | "audit";

/** The admin console's shared shell — the app topbar in its admin register.
 *  Wraps every state (loading, 403, the console) so the chrome never changes
 *  between them and there is no per-page back button. */
function AdminShell({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide app-topbar--admin">
        <div className="app-topbar__inner">
          <Link to="/" aria-label="Home" className="app-lockup-link">
            <Wordmark size="sm" />
          </Link>
          <span className="app-lockup__role">Admin console</span>
          <div className="app-topbar__spacer" />
          <div className="app-topbar__actions">
            {isAdmin && (
              <>
                <RoleSwitch
                  courseId={null}
                  role="instructor"
                  isAdmin
                  current="admin"
                />
                <span className="app-topbar__divider" aria-hidden />
              </>
            )}
            <IconButton title="Sign out" onClick={signOut}>
              <SignOutIcon />
            </IconButton>
          </div>
        </div>
      </header>
      <div className="app__body">{children}</div>
    </div>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("instructors");
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
      <AdminShell isAdmin={false}>
        <div className="app-page">
          <p className="muted">Loading…</p>
        </div>
      </AdminShell>
    );
  }
  if (!isAdmin) {
    return (
      <AdminShell isAdmin={false}>
        <div className="app-page">
          <div className="app-page__head">
            <div>
              <span className="eyebrow">Admin</span>
              <h1>No access</h1>
            </div>
          </div>
          <p className="error">You don&rsquo;t have access to this page.</p>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell isAdmin>
      <div className="app-page">
        <div className="app-page__head">
          <div>
            <span className="eyebrow">Instance</span>
            <h1>Admin</h1>
            <div className="app-page__scope">
              Instance-wide controls: who teaches which course, who can
              administer the platform, everyone who has signed in, and the audit
              log. Instructors create and run their own courses — that lives on
              the instructor dashboard, not here.
            </div>
          </div>
        </div>
        <div className="app-section">
          <SegmentedControl
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { value: "instructors", label: "Instructors" },
              { value: "courses", label: "Courses" },
              { value: "admins", label: "Admins" },
              { value: "users", label: "Users" },
              { value: "audit", label: "Audit log" },
            ]}
          />
        </div>
        {tab === "instructors" && <InstructorsTab meUserId={meUserId} />}
        {tab === "courses" && <CoursesTab />}
        {tab === "admins" && <AdminsTab meUserId={meUserId} />}
        {tab === "users" && <UsersTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </AdminShell>
  );
}

// Instructors — add / remove a course's instructors by email. Course-scoped
// under the hood (addRosterEntry / removeRosterEntry with role "instructor"),
// surfaced here so one instance-wide screen owns who teaches what. Students
// self-enroll with a join code and are managed on the course People page, not
// here.
function InstructorsTab({ meUserId }: { meUserId: string | null }) {
  const [courses, setCourses] = useState<AdminCourse[] | null>(null);
  const [courseId, setCourseId] = useState<string>("");
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [draftEmail, setDraftEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    listAdminCourses()
      .then((r) => {
        setCourses(r.courses);
        if (r.courses.length > 0) setCourseId((id) => id || r.courses[0]!.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  function reloadRoster(id: string) {
    if (!id) return;
    setRoster(null);
    listRoster(id)
      .then((r) => setRoster(r.roster))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }
  useEffect(() => {
    if (courseId) reloadRoster(courseId);
  }, [courseId]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draftEmail.trim() || !courseId) return;
    setBusy(true);
    setError(null);
    try {
      await addRosterEntry(courseId, draftEmail.trim().toLowerCase(), "instructor");
      setDraftEmail("");
      reloadRoster(courseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }
  async function onRemove(entry: RosterEntry) {
    if (
      !(await confirm({
        title: "Remove instructor?",
        body: `${entry.email} will no longer be an instructor of this course.`,
        confirmLabel: "Remove",
      }))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await removeRosterEntry(courseId, entry.userId);
      reloadRoster(courseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  const instructors = (roster ?? []).filter((r) => r.role === "instructor");

  return (
    <div className="app-section">
      <span className="mono-label app-section__label">Instructors</span>
      <p className="muted small">
        Add an instructor to a course by email — they must have signed in at
        least once. This used to be buried inside each course&rsquo;s People
        page; it lives here now so one screen owns who teaches what. Students
        self-enroll with a join code and never appear here.
      </p>
      {error && <p className="error">{error}</p>}

      <form
        onSubmit={onAdd}
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "flex-end",
          flexWrap: "wrap",
          margin: "1rem 0",
        }}
      >
        <div style={{ flex: 1, minWidth: "16rem" }}>
          <Field label="Instructor email">
            <Input
              type="email"
              placeholder="someone@example.edu"
              value={draftEmail}
              disabled={busy || !courseId}
              onChange={(e) => setDraftEmail(e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: "0 0 16rem", minWidth: 0 }}>
          <Field label="Course">
            <Dropdown
              className="ds-dropdown--block"
              ariaLabel="Course"
              value={courseId}
              disabled={busy || courses === null || courses.length === 0}
              onChange={(v) => setCourseId(v)}
              placeholder={
                courses === null
                  ? "Loading…"
                  : courses.length === 0
                    ? "No courses"
                    : undefined
              }
              options={(courses ?? []).map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
          </Field>
        </div>
        <Button
          type="submit"
          variant="primary"
          icon={<PlusIcon size={16} />}
          loading={busy}
          disabled={busy || !draftEmail.trim() || !courseId}
        >
          Add instructor
        </Button>
      </form>

      {roster === null ? (
        <p className="muted">Loading…</p>
      ) : instructors.length === 0 ? (
        <p className="muted">No instructors on this course yet.</p>
      ) : (
        <div className="app-list">
          {instructors.map((p) => {
            const isSelf = meUserId !== null && p.userId === meUserId;
            return (
              <div className="app-list__row" key={p.userId}>
                <Avatar name={p.displayName || p.email} size="sm" />
                <div className="app-list__main">
                  <div className="app-list__title">
                    <Link to={`/users/${p.userId}`}>
                      {p.displayName || p.email}
                    </Link>
                    {isSelf && <span className="muted small"> · you</span>}
                  </div>
                  <div className="app-list__sub">{p.email}</div>
                </div>
                <div className="app-list__meta">
                  <Badge tone="brand">instructor</Badge>
                  {!isSelf && (
                    <IconButton
                      variant="ghost"
                      size="sm"
                      title="Remove from course"
                      disabled={busy}
                      onClick={() => onRemove(p)}
                    >
                      <TrashIcon size={16} />
                    </IconButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function CoursesTab() {
  const [courses, setCourses] = useState<AdminCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

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
      !(await confirm({
        title: `Delete course “${course.name}”?`,
        body: "This removes every agent, collection, source, join code, and enrollment. Student transcripts are preserved as orphaned rows but become unreachable through the app. This action cannot be undone.",
        confirmLabel: "Delete",
      }))
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
      {confirmDialog}
    </div>
  );
}

function AdminsTab({ meUserId }: { meUserId: string | null }) {
  const [admins, setAdmins] = useState<AdminEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

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

  async function onRevoke(entry: AdminEntry) {
    if (
      !(await confirm({
        title: "Revoke admin?",
        body: `${entry.email} will lose instance-admin access.`,
        confirmLabel: "Revoke",
      }))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await demoteAdmin(entry.userId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
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
        once. Revoke here or from the user&rsquo;s page; you can&rsquo;t revoke
        your own admin.
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
              <div key={a.userId} className="app-list__row">
                <Link
                  to={`/users/${a.userId}`}
                  className="app-list__link"
                  style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 0 }}
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
                </Link>
                <div className="app-list__meta">
                  <Badge tone="brand">admin</Badge>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy || isSelf}
                    title={isSelf ? "You can't revoke your own admin." : undefined}
                    onClick={() => onRevoke(a)}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {confirmDialog}
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
