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

  return (
    <section>
      <p className="scope-note">
        Everyone enrolled in this course. Each row links into a per-user
        page covering every course they're in.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="sub-tab-row" role="tablist">
          {(["students", "authors"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`tab-button${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
              type="button"
            >
              {t === "students" ? "Students" : "Authors"}
            </button>
          ))}
        </div>

        <section className="field-group">
          <h2>Join codes</h2>
          <p className="muted small">
            Share a code (or the join link) with students so they can self-enroll
            after signing in. Codes only ever add students; instructors are added
            on the roster below. Allowed email domains are set instance-wide in
            ALLOWED_EMAIL_DOMAINS — see docs/operations.md.
          </p>
          {codesError && <p className="error">{codesError}</p>}
          <div className="inline-form">
            <input
              type="number"
              min="1"
              placeholder="Max uses (optional)"
              value={codeDraftMaxUses}
              disabled={codeBusy}
              onChange={(e) => setCodeDraftMaxUses(e.target.value)}
              style={{ maxWidth: "10rem" }}
            />
            <button onClick={onGenerateCode} disabled={codeBusy} type="button">
              {codeBusy ? "Generating…" : "Generate code"}
            </button>
          </div>
          {codes === null ? (
            <p className="muted">Loading…</p>
          ) : codes.length === 0 ? (
            <p className="muted">No codes yet.</p>
          ) : (
            <ul className="assignment-list">
              {codes.map((c) => {
                const active = !c.revokedAt &&
                  (c.expiresAt === null || c.expiresAt > Date.now()) &&
                  (c.maxUses === null || c.uses < c.maxUses);
                return (
                  <li key={c.code}>
                    <div>
                      <strong style={{ fontFamily: "monospace" }}>{c.code}</strong>
                      {!active && <span className="muted small"> · inactive</span>}
                      <div className="muted small">
                        Used {c.uses}
                        {c.maxUses !== null ? <> / {c.maxUses}</> : <> times</>}
                        {c.emailDomain && <> · legacy @{c.emailDomain}</>}
                        {c.revokedAt && <> · revoked</>}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="subtle"
                        onClick={() => copyToClipboard(c.code, `code-${c.code}`)}
                      >
                        {copied === `code-${c.code}` ? "Copied!" : "Copy code"}
                      </button>
                      <button
                        type="button"
                        className="subtle"
                        onClick={() => copyToClipboard(joinUrl(c.code), `url-${c.code}`)}
                      >
                        {copied === `url-${c.code}` ? "Copied!" : "Copy link"}
                      </button>
                      {active && (
                        <button
                          type="button"
                          className="danger-link"
                          disabled={codeBusy}
                          onClick={() => onRevokeCode(c.code)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {addOpen ? (
          <section className="field-group">
            <h2>Add by email</h2>
            <div className="inline-form">
              <input
                type="email"
                placeholder="someone@example.edu"
                value={draftEmail}
                disabled={busy}
                autoFocus
                onChange={(e) => setDraftEmail(e.target.value)}
              />
              <select
                value={draftRole}
                disabled={busy}
                onChange={(e) => setDraftRole(e.target.value as EnrollmentRole)}
              >
                <option value="student">Student</option>
                <option value="instructor">Instructor</option>
              </select>
              <button onClick={onAdd} disabled={busy || !draftEmail.trim()}>
                {busy ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                className="subtle"
                disabled={busy}
                onClick={() => {
                  setAddOpen(false);
                  setDraftEmail("");
                }}
              >
                Cancel
              </button>
            </div>
            <p className="muted small">
              If the email hasn't signed in yet, an empty user row is created
              and "claimed" the first time they sign in.
            </p>
          </section>
        ) : (
          <div className="form-actions">
            <button
              type="button"
              className="subtle"
              onClick={() => setAddOpen(true)}
            >
              + Add person
            </button>
          </div>
        )}

        <section className="field-group">
          <h2>{tab === "students" ? "Students" : "Authors"}</h2>
          <div className="inline-form">
            <input
              type="search"
              placeholder="Filter by email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {roster === null ? (
            <p className="muted">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="muted">No one here yet.</p>
          ) : (
            <ul className="assignment-list">
              {filtered.map((r) => {
                const isSelf = meUserId !== null && r.userId === meUserId;
                return (
                  <li key={r.userId}>
                    <div>
                      <Link to={`/users/${r.userId}`}>
                        <strong>{r.email}</strong>
                      </Link>
                      {isSelf && <span className="muted small"> · you</span>}
                      {r.displayName && (
                        <span className="muted small"> · {r.displayName}</span>
                      )}
                      <div className="muted small">
                        Joined {relativeTime(r.joinedAt)}
                        {" · "}
                        {r.lastSeenAt
                          ? <>Last seen {relativeTime(r.lastSeenAt)}</>
                          : <>Never signed in</>}
                      </div>
                    </div>
                    <div className="row-actions">
                      {/* The instructor can't downgrade themselves or remove
                          their own enrollment in the UI; the server enforces
                          the same rules. */}
                      <select
                        value={r.role}
                        disabled={busy || isSelf}
                        onChange={(e) =>
                          onRoleChange(r, e.target.value as EnrollmentRole)
                        }
                        title={isSelf ? "You can't change your own role." : undefined}
                      >
                        <option value="student">{roleLabel("student")}</option>
                        <option value="instructor">{roleLabel("instructor")}</option>
                      </select>
                      <button
                        type="button"
                        className="danger-link"
                        disabled={busy || isSelf}
                        onClick={() => onRemove(r)}
                        title={isSelf ? "Ask another instructor to remove you." : undefined}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
    </section>
  );
}
