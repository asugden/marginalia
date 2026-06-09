// Instructor-only roster management (v0.4 §10).
//
//   /author/roster — list everyone enrolled in the course. Add by email,
//   change role, remove. Two tabs (Students / Authors) just to keep the
//   list focused; the underlying enrollments table is one flat set.
//
// The API enforces instructor-only; this UI is best-effort gating only.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addRosterEntry,
  createJoinCode,
  getMe,
  listJoinCodes,
  listRoster,
  patchRosterEntry,
  removeRosterEntry,
  revokeJoinCode,
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
  SegmentedControl,
  Select,
} from "../components/index.js";
import { PlusIcon, TrashIcon } from "../icons.js";

type Tab = "students" | "authors";

function roleLabel(r: EnrollmentRole): string {
  return r[0]!.toUpperCase() + r.slice(1);
}

export function RosterPage() {
  const { courseId } = useCourse();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("students");
  const [query, setQuery] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftRole, setDraftRole] = useState<EnrollmentRole>("student");
  const [busy, setBusy] = useState(false);
  // Add-by-email form is collapsed by default — instructor's hot path is
  // scanning the existing roster, not adding new people every visit (v0.5 §9).
  const [addOpen, setAddOpen] = useState(false);
  // Identity of the logged-in instructor. Used to disable self-affecting
  // controls in the UI (v0.4 §10: "Removing your own author enrollment is
  // blocked"). The server enforces this independently — see
  // patchRosterRoute / removeRosterRoute — so this gating is UX, not a
  // trust boundary.
  const [meUserId, setMeUserId] = useState<string | null>(null);

  // v0.6 §4 — course join codes. Loaded alongside the roster.
  // v0.7 §3.12 — per-code domain field removed; gate is instance-wide.
  const [codes, setCodes] = useState<JoinCode[] | null>(null);
  const [codesError, setCodesError] = useState<string | null>(null);
  const [codeDraftMaxUses, setCodeDraftMaxUses] = useState<string>("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function reload() {
    setError(null);
    listRoster(courseId)
      .then((r) => setRoster(r.roster))
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

  async function onGenerateCode() {
    setCodeBusy(true);
    setCodesError(null);
    try {
      const maxUses = codeDraftMaxUses.trim()
        ? Number(codeDraftMaxUses.trim())
        : null;
      await createJoinCode(courseId, {
        maxUses: maxUses !== null && Number.isFinite(maxUses) && maxUses > 0
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
    if (!window.confirm(`Revoke code "${code}"? Existing enrollments aren't affected.`)) {
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
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // Older browsers / non-secure contexts: silently no-op rather than
      // surfacing a noisy error for what should be a convenience action.
    }
  }

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (!ctrl.signal.aborted) setMeUserId(m.userId);
      })
      .catch(() => {
        // Not load-bearing — without /me we just don't disable self-controls.
        // The server still refuses the dangerous mutations.
      });
    return () => ctrl.abort();
  }, []);

  const filtered = useMemo(() => {
    if (!roster) return [];
    const want = tab === "students" ? ["student"] : ["instructor"];
    const q = query.trim().toLowerCase();
    return roster.filter((r) => {
      if (!want.includes(r.role)) return false;
      if (q && !r.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roster, tab, query]);

  // Match the tab to the default role for the add form — if the instructor is
  // looking at Authors they probably want to add an author.
  useEffect(() => {
    setDraftRole(tab === "students" ? "student" : "instructor");
  }, [tab]);

  async function onAdd() {
    if (!draftEmail.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addRosterEntry(courseId, draftEmail.trim().toLowerCase(), draftRole);
      setDraftEmail("");
      setAddOpen(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(entry: RosterEntry, role: EnrollmentRole) {
    if (entry.role === role) return;
    // Surface downgrade-to-student confirmation; promotions are silent.
    if (entry.role === "instructor" && role === "student") {
      if (!window.confirm(`Downgrade ${entry.email} to student?`)) return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchRosterEntry(courseId, entry.userId, role);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(entry: RosterEntry) {
    if (!window.confirm(`Remove ${entry.email} from the course?`)) return;
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

  const studentCount = roster?.filter((r) => r.role === "student").length ?? 0;
  const authorCount = roster?.filter((r) => r.role === "instructor").length ?? 0;

  return (
    <div className="ds-staff-page">
      <div className="ds-staff-head">
        <div>
          <span className="eyebrow">Roster</span>
          <h1>People</h1>
          <div className="ds-staff-head__scope">
            Everyone enrolled in this course. Each row links into a per-user page
            covering every course they&rsquo;re in.
          </div>
        </div>
        <div className="ds-staff-actions">
          <Button
            variant={addOpen ? "ghost" : "subtle"}
            icon={<PlusIcon size={16} />}
            onClick={() => {
              setAddOpen((v) => !v);
              if (addOpen) setDraftEmail("");
            }}
          >
            Add person
          </Button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="ds-staff-section">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "students", label: "Students", count: studentCount },
            { value: "authors", label: "Instructors", count: authorCount },
          ]}
        />
      </div>

      {addOpen && (
        <div className="ds-staff-section ds-staff-row">
          <Field label="Email">
            <Input
              type="email"
              placeholder="someone@example.edu"
              value={draftEmail}
              disabled={busy}
              autoFocus
              onChange={(e) => setDraftEmail(e.target.value)}
            />
          </Field>
          <Field label="Role">
            <Select
              value={draftRole}
              disabled={busy}
              onChange={(e) => setDraftRole(e.target.value as EnrollmentRole)}
            >
              <option value="student">Student</option>
              <option value="instructor">Instructor</option>
            </Select>
          </Field>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <Button
              onClick={onAdd}
              loading={busy}
              disabled={busy || !draftEmail.trim()}
            >
              Add
            </Button>
            <Button
              variant="subtle"
              disabled={busy}
              onClick={() => {
                setAddOpen(false);
                setDraftEmail("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="ds-staff-section">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.7rem",
            gap: "1rem",
          }}
        >
          <span className="mono-label">
            {tab === "students" ? "Students" : "Instructors"}
          </span>
          <div style={{ maxWidth: "16rem", flex: 1 }}>
            <Input
              type="search"
              placeholder="Filter by email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {roster === null ? (
          <p className="muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="muted">No one here yet.</p>
        ) : (
          <div className="ds-roster">
            {filtered.map((r) => {
              const isSelf = meUserId !== null && r.userId === meUserId;
              return (
                <div className="ds-roster__row" key={r.userId}>
                  <div className="ds-roster__person">
                    <Avatar name={r.displayName || r.email} />
                    <div style={{ minWidth: 0 }}>
                      <div className="ds-roster__name">
                        <Link to={`/users/${r.userId}`}>
                          {r.displayName || r.email}
                        </Link>
                        {isSelf && <span className="muted small"> · you</span>}
                      </div>
                      <div className="ds-roster__email">{r.email}</div>
                    </div>
                  </div>
                  <span className="ds-roster__meta">
                    Joined {relativeTime(r.joinedAt)}
                    {" · "}
                    {r.lastSeenAt
                      ? `Last seen ${relativeTime(r.lastSeenAt)}`
                      : "Never signed in"}
                  </span>
                  <div className="ds-roster__actions">
                    {/* The instructor can't downgrade or remove themselves in
                        the UI; the server enforces the same rules. */}
                    <Select
                      value={r.role}
                      disabled={busy || isSelf}
                      onChange={(e) =>
                        onRoleChange(r, e.target.value as EnrollmentRole)
                      }
                      title={
                        isSelf ? "You can't change your own role." : undefined
                      }
                    >
                      <option value="student">{roleLabel("student")}</option>
                      <option value="instructor">
                        {roleLabel("instructor")}
                      </option>
                    </Select>
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
      </div>

      {/* Join codes — the kit's join-code panel, expanded to the real
          multi-code management this page already supported. */}
      <div className="ds-staff-section">
        <span className="mono-label ds-staff-section__label">
          Invite students
        </span>
        <p className="muted small">
          Share a code (or the join link) with students so they can self-enroll
          after signing in. Codes only ever add students; instructors are added
          on the roster above. Allowed email domains are set instance-wide in
          ALLOWED_EMAIL_DOMAINS — see the operations docs.
        </p>
        {codesError && <p className="error">{codesError}</p>}
        <div className="ds-joincode">
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
          <div className="ds-src-list" style={{ marginTop: "1rem" }}>
            {codes.map((c) => {
              const active =
                !c.revokedAt &&
                (c.expiresAt === null || c.expiresAt > Date.now()) &&
                (c.maxUses === null || c.uses < c.maxUses);
              return (
                <div className="ds-src-row" key={c.code}>
                  <span className="ds-joincode__code" style={{ fontSize: "1rem" }}>
                    {c.code}
                  </span>
                  <span className="ds-src-row__name" style={{ fontWeight: 400 }}>
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
                    onClick={() => copyToClipboard(joinUrl(c.code), `url-${c.code}`)}
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
      </div>
    </div>
  );
}
