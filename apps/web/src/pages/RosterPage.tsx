// Per-course People page — STUDENTS only (v1.1).
//
//   /course/:id/instructor/roster — the students enrolled in this course. They
//   add themselves with a join code (the code is the invite — there is no
//   manual student invite here); an instructor can remove someone who
//   shouldn't be here. Instructors and admins are managed instance-wide in the
//   Admin console (Instructors / Admins tabs), NOT on this per-course page —
//   this keeps "who teaches / runs the platform" in one place instead of
//   scattered across every course's roster.
//
// The API enforces instructor-only; this UI is best-effort gating only.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createJoinCode,
  getMe,
  listJoinCodes,
  listRoster,
  removeRosterEntry,
  revokeJoinCode,
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
  useConfirm,
} from "../components/index.js";
import { PlusIcon, TrashIcon } from "../icons.js";

export function RosterPage() {
  const { courseId } = useCourse();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
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
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // Older browsers / non-secure contexts: silently no-op.
    }
  }

  async function onRemove(entry: RosterEntry) {
    if (
      !(await confirm({
        title: "Remove this student?",
        body: `${entry.email} will lose access to this course. They can rejoin later with a join code.`,
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

  // Students only. Instructors live in the Admin console now, so they never
  // appear in this list.
  const students = (roster ?? []).filter((r) => r.role === "student");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? students.filter((r) => r.email.toLowerCase().includes(q))
    : students;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Roster"
        title="People"
        scope="Students enrolled in this course. They add themselves with the join code below — no manual invites. Instructors are managed in the Admin console, not here."
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
        kicker={`Enrolled · ${students.length} student${students.length === 1 ? "" : "s"}`}
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
                        <Link to={`/users/${r.userId}`}>
                          {r.displayName || r.email}
                        </Link>
                        {isSelf && <span className="muted small"> · you</span>}
                      </div>
                      <div className="roster__email">{r.email}</div>
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
      {confirmDialog}
    </div>
  );
}
