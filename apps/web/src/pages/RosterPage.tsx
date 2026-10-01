// Per-course People page.
//
//   /course/:id/instructor/roster — the students enrolled in this course, and
//   the course staff. Students add themselves with a join code (the code is
//   the invite — there is no manual student invite here); course staff can
//   remove someone who shouldn't be here.
//
//   Course staff (0028): an instructor adds TAs by email here; an admin can
//   add anyone, instructors included. A TA manages students only, so the
//   staff section is read-only for them. The worker's permission table
//   decides — `assignableRoles` from listRoster is exactly what it will
//   accept from this caller, and this page offers nothing more.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createJoinCode,
  getMe,
  listJoinCodes,
  listRoster,
  addRosterEntry,
  removeRosterEntry,
  revokeJoinCode,
  roleLabel,
  type EnrollmentRole,
  type JoinCode,
  type RosterEntry,
} from "../client.js";
import { useCourse } from "../course/useCourse.js";
import { relativeTime } from "../time.js";
import {
  Avatar,
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  PageHeader,
  Section,
  Select,
  useConfirm,
} from "../components/index.js";
import { PlusIcon, TrashIcon } from "../icons.js";

export function RosterPage() {
  const { courseId, isAdmin } = useCourse();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [assignable, setAssignable] = useState<EnrollmentRole[]>([]);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<EnrollmentRole>("ta");
  const [staffError, setStaffError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  // Identity of the logged-in instructor. Used to disable self-affecting
  // controls in the UI. The server enforces this independently.
  const [meUserId, setMeUserId] = useState<string | null>(null);

  // v0.6 §4 — course join codes. Loaded alongside the roster.
  const [codes, setCodes] = useState<JoinCode[] | null>(null);
  const [codesError, setCodesError] = useState<string | null>(null);
  const [codeDraftMaxUses, setCodeDraftMaxUses] = useState<string>("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  function reload() {
    setError(null);
    listRoster(courseId)
      .then((r) => {
        setRoster(r.roster);
        setAssignable(r.assignableRoles ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }
  function reloadCodes() {
    setCodesError(null);
    listJoinCodes(courseId)
      .then((r) => setCodes(r.codes))
      .catch((e) =>
        setCodesError(e instanceof Error ? e.message : "Load failed"),
      );
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [courseId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reloadCodes, [courseId]);

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (!ctrl.signal.aborted) setMeUserId(m.userId);
      })
      .catch(() => {
        // Not load-bearing — without /me we just don't disable self-controls.
      });
    return () => ctrl.abort();
  }, []);

  async function onGenerateCode() {
    setCodeBusy(true);
    setCodesError(null);
    try {
      const maxUses = codeDraftMaxUses.trim()
        ? Number(codeDraftMaxUses.trim())
        : null;
      await createJoinCode(courseId, {
        maxUses:
          maxUses !== null && Number.isFinite(maxUses) && maxUses > 0
            ? maxUses
            : null,
      });
      setCodeDraftMaxUses("");
      reloadCodes();
    } catch (e) {
      setCodesError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setCodeBusy(false);
    }
  }
  async function onRevokeCode(code: string) {
    if (
      !(await confirm({
        title: "Revoke this code?",
        body: `Code "${code}" will stop working for new students. Existing enrollments aren't affected.`,
        confirmLabel: "Revoke",
      }))
    ) {
      return;
    }
    setCodeBusy(true);
    setCodesError(null);
    try {
      await revokeJoinCode(courseId, code);
      reloadCodes();
    } catch (e) {
      setCodesError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setCodeBusy(false);
    }
  }
  function joinUrl(code: string): string {
    return `${window.location.origin}/join/${code}`;
  }
  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Non-secure contexts / older browsers have no navigator.clipboard.
      // The join code is the sole enrollment mechanism, so a silent no-op
      // here left the button dead — fall back to the legacy path.
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch {
        setCodesError("Couldn't copy — select the code and copy it by hand.");
        return;
      }
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  async function onAddStaff(role: EnrollmentRole) {
    const email = staffEmail.trim().toLowerCase();
    if (!email) return;
    setBusy(true);
    setStaffError(null);
    try {
      await addRosterEntry(courseId, email, role);
      setStaffEmail("");
      reload();
    } catch (e) {
      setStaffError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(entry: RosterEntry) {
    const isStudent = entry.role === "student";
    if (
      !(await confirm({
        title: isStudent ? "Remove this student?" : `Remove this ${roleLabel(entry.role)}?`,
        body: isStudent
          ? `${entry.email} will lose access to this course. They can rejoin later with a join code.`
          : `${entry.email} will lose access to this course.`,
        confirmLabel: "Remove",
      }))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await removeRosterEntry(courseId, entry.userId);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  const students = (roster ?? []).filter((r) => r.role === "student");
  // The sample student is the identity previews run as — listed (so its work
  // is findable) but never counted as a person.
  const realStudents = students.filter((r) => !r.isSample);
  const staff = (roster ?? []).filter((r) => r.role !== "student");
  // Roles this caller may give by email here. Students join by code, so the
  // staff form offers staff roles only.
  const staffRoles = assignable.filter((r) => r !== "student");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? students.filter((r) => r.email.toLowerCase().includes(q))
    : students;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Roster"
        title="People"
        scope="Students add themselves with the join code below — no manual invites. Course staff (instructors and TAs) are listed at the bottom."
      />

      {error && <p className="error">{error}</p>}

      {/* Join codes — the way students enroll. */}
      <Section
        kicker="Join code · share with students"
        description="Share a code (or the join link) so students can self-enroll after signing in. Codes only ever add students. Allowed email domains are set instance-wide in ALLOWED_EMAIL_DOMAINS — see the operations docs."
      >
        {codesError && <p className="error">{codesError}</p>}
        <div className="joincode">
          <div style={{ flex: 1, minWidth: "10rem" }}>
            <Field label="Max uses (optional)">
              <Input
                type="number"
                min="1"
                mono
                placeholder="unlimited"
                value={codeDraftMaxUses}
                disabled={codeBusy}
                onChange={(e) => setCodeDraftMaxUses(e.target.value)}
              />
            </Field>
          </div>
          <Button
            variant="primary"
            icon={<PlusIcon size={16} />}
            onClick={onGenerateCode}
            loading={codeBusy}
            disabled={codeBusy}
          >
            Generate code
          </Button>
        </div>

        {codes === null ? (
          <p className="muted" style={{ marginTop: "1rem" }}>
            Loading…
          </p>
        ) : codes.length === 0 ? (
          <p className="muted" style={{ marginTop: "1rem" }}>
            No codes yet.
          </p>
        ) : (
          <div className="src-list" style={{ marginTop: "1rem" }}>
            {codes.map((c) => {
              const active =
                !c.revokedAt &&
                (c.expiresAt === null || c.expiresAt > Date.now()) &&
                (c.maxUses === null || c.uses < c.maxUses);
              return (
                <div className="src-row" key={c.code}>
                  <span className="joincode__code" style={{ fontSize: "1rem" }}>
                    {c.code}
                  </span>
                  <span className="src-row__name" style={{ fontWeight: 400 }}>
                    Used {c.uses}
                    {c.maxUses !== null ? ` / ${c.maxUses}` : " times"}
                    {c.emailDomain ? ` · legacy @${c.emailDomain}` : ""}
                  </span>
                  <Badge tone={active ? "success" : "neutral"} dot={active}>
                    {c.revokedAt ? "revoked" : active ? "active" : "inactive"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(c.code, `code-${c.code}`)}
                  >
                    {copied === `code-${c.code}` ? "Copied" : "Copy code"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(joinUrl(c.code), `url-${c.code}`)
                    }
                  >
                    {copied === `url-${c.code}` ? "Copied" : "Copy link"}
                  </Button>
                  {active && (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={codeBusy}
                      onClick={() => onRevokeCode(c.code)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Enrolled students. */}
      <Section
        kicker={`Enrolled · ${realStudents.length} student${realStudents.length === 1 ? "" : "s"}`}
        actions={
          <Input
            type="search"
            placeholder="Filter by email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "16rem", maxWidth: "40vw" }}
          />
        }
      >
        {roster === null ? (
          <p className="muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="muted">
            {students.length === 0
              ? "No students yet — share the join code above."
              : "No students match that filter."}
          </p>
        ) : (
          <div className="roster">
            {filtered.map((r) => {
              const isSelf = meUserId !== null && r.userId === meUserId;
              return (
                <div className="roster__row" key={r.userId}>
                  <div className="roster__person">
                    <Avatar name={r.displayName || r.email} />
                    <div style={{ minWidth: 0 }}>
                      <div className="roster__name">
                        {/* /users/:id is the ADMIN console's per-user page —
                            the worker 403s everyone else — so the name is a
                            link only for admins. An instructor clicking a
                            student's name used to land on an "Admin only"
                            dead end. */}
                        {isAdmin ? (
                          <Link to={`/users/${r.userId}`}>
                            {r.displayName || r.email}
                          </Link>
                        ) : (
                          <span>{r.displayName || r.email}</span>
                        )}
                        {isSelf && <span className="muted small"> · you</span>}
                        {r.isSample && (
                          <>
                            {" "}
                            <Badge tone="neutral">Sample</Badge>
                          </>
                        )}
                      </div>
                      <div className="roster__email">
                        {r.isSample
                          ? "Previews of this course run as this student"
                          : r.email}
                      </div>
                    </div>
                  </div>
                  <span className="roster__meta">
                    Joined {relativeTime(r.joinedAt)}
                    {" · "}
                    {r.lastSeenAt
                      ? `Last seen ${relativeTime(r.lastSeenAt)}`
                      : "Never signed in"}
                  </span>
                  <div className="roster__actions">
                    <IconButton
                      variant="ghost"
                      size="sm"
                      title={
                        isSelf
                          ? "Ask another instructor to remove you."
                          : "Remove from course"
                      }
                      disabled={busy || isSelf}
                      onClick={() => onRemove(r)}
                    >
                      <TrashIcon size={16} />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
      {/* Course staff — instructors and TAs. */}
      <Section
        kicker={`Course staff · ${staff.length}`}
        description={
          staffRoles.includes("instructor")
            ? "TAs manage students, see submissions, and run attendance; they don't author. As an admin you can add instructors too."
            : staffRoles.includes("ta")
              ? "Add a TA by their institutional email. TAs manage students, see submissions, and run attendance; they don't author. Only an admin can add instructors."
              : "Who teaches this course."
        }
      >
        {staffError && <p className="error">{staffError}</p>}
        {staffRoles.length > 0 && (
          <div className="joincode">
            <div style={{ flex: 2, minWidth: "12rem" }}>
              <Field label="Email">
                <Input
                  type="email"
                  placeholder="name@institution.edu"
                  value={staffEmail}
                  disabled={busy}
                  onChange={(e) => setStaffEmail(e.target.value)}
                />
              </Field>
            </div>
            {staffRoles.length > 1 && (
              <Field label="Role">
                <Select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as EnrollmentRole)}
                >
                  {staffRoles.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Button
              variant="primary"
              icon={<PlusIcon size={16} />}
              onClick={() =>
                // A single offered role (the usual instructor case: TA) has
                // no picker — send that role.
                void onAddStaff(staffRoles.length === 1 ? staffRoles[0]! : staffRole)
              }
              loading={busy}
              disabled={busy || !staffEmail.trim()}
            >
              Add {staffRoles.length === 1 ? roleLabel(staffRoles[0]!) : "person"}
            </Button>
          </div>
        )}
        {roster === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="roster" style={{ marginTop: staffRoles.length > 0 ? "1rem" : 0 }}>
            {staff.map((r) => {
              const isSelf = meUserId !== null && r.userId === meUserId;
              const removable = !isSelf && assignable.includes(r.role);
              return (
                <div className="roster__row" key={r.userId}>
                  <div className="roster__person">
                    <Avatar name={r.displayName || r.email} />
                    <div style={{ minWidth: 0 }}>
                      <div className="roster__name">
                        <span>{r.displayName || r.email}</span>
                        {isSelf && <span className="muted small"> · you</span>}
                      </div>
                      <div className="roster__email">{r.email}</div>
                    </div>
                  </div>
                  <span className="roster__meta">
                    <Badge tone="neutral">{roleLabel(r.role)}</Badge>
                    {" · "}
                    {r.lastSeenAt
                      ? `Last seen ${relativeTime(r.lastSeenAt)}`
                      : "Never signed in"}
                  </span>
                  <div className="roster__actions">
                    {removable && (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        title="Remove from course"
                        disabled={busy}
                        onClick={() => onRemove(r)}
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
      </Section>
      {confirmDialog}
    </div>
  );
}
