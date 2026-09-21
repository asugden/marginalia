// Submit modal (slice 6). Freezes a snapshot of the document — the render is
// computed server-side from the edit-event log — and records it for the course's
// instructors.
//
// This started life as a *share* modal that minted a public URL and copied it to
// the clipboard. It isn't that anymore: only signed-in instructors of the course
// can open a snapshot, so a copied URL was useless to the student holding it.
// The surface is now framed as submitting, and its main job besides the button is
// showing the student WHEN each previous version was submitted — they resubmit
// repeatedly (often right up to a deadline) and need to see what's already in.
// Each submission is a separate immutable row; resubmitting never replaces one.
//
// When the course has assignments, the student also picks which checkpoint
// they're submitting to, and sees its deadline before they commit. A submission
// past the deadline is ACCEPTED — there is no cutoff anywhere in this module —
// and the notice says so plainly. It exists so nobody is surprised by a LATE
// label they had no way to anticipate, not to discourage them from submitting.
// A course with no assignments gets exactly the modal it had before.

import { useEffect, useState } from "react";
import {
  listAssignments,
  listSubmissions,
  mintSubmission,
  revokeSubmission,
  type AssignmentDTO,
  type SubmissionSummary,
} from "../api.js";
import { Button, Field, Select, SubLabel, useConfirm } from "../../../components/index.js";
import { relativeTime } from "../../../time.js";
import { ShareIcon } from "../../../icons.js";

interface Props {
  documentId: string;
  courseId: string;
  /** Whether the viewer may revoke submissions. Students can't (theirs are
   *  permanent — a student can't quietly un-submit); the worker enforces the
   *  same rule. */
  canRevoke: boolean;
  onClose: () => void;
}

/** Exact submission time. Students submit against deadlines, so the precise
 *  clock time matters more here than a rounded "2 days ago" alone. */
function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Deadline, in the same face as a submission time — the two sit next to each
 *  other in the late notice and must be comparable at a glance. */
function formatDeadline(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The <option> value. Both ids travel together because the server requires the
 *  pair and verifies the checkpoint really belongs to that assignment. */
const cellKey = (assignmentId: string, checkpointId: string) =>
  `${assignmentId}:${checkpointId}`;

function findCheckpoint(
  assignments: AssignmentDTO[],
  key: string,
): { assignment: AssignmentDTO; checkpoint: AssignmentDTO["checkpoints"][number] } | null {
  if (!key) return null;
  for (const a of assignments) {
    for (const c of a.checkpoints) {
      if (cellKey(a.id, c.id) === key) return { assignment: a, checkpoint: c };
    }
  }
  return null;
}

export function SubmissionModal({ documentId, courseId, canRevoke, onClose }: Props) {
  const [subs, setSubs] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentDTO[]>([]);
  // "" = submit without attaching to anything, which is what every submission
  // did before assignments existed and stays available afterwards.
  const [choice, setChoice] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    const ctrl = new AbortController();
    listSubmissions(documentId, courseId, ctrl.signal)
      .then((s) => { if (!ctrl.signal.aborted) setSubs(s); })
      .catch((e) => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Load failed"); });
    return () => ctrl.abort();
  }, [documentId, courseId]);

  useEffect(() => {
    const ctrl = new AbortController();
    // A failure here is deliberately silent: the picker is an addition, and a
    // student must still be able to submit if the assignment list won't load.
    listAssignments(courseId, undefined, ctrl.signal)
      .then((a) => {
        if (ctrl.signal.aborted) return;
        setAssignments(a);
        // Preselect when there is exactly one checkpoint in the whole course —
        // with one thing to submit to, making them choose it is friction.
        const only = a.flatMap((x) => x.checkpoints.map((c) => cellKey(x.id, c.id)));
        if (only.length === 1) setChoice(only[0]!);
      })
      .catch(() => { /* picker stays hidden; submitting still works */ });
    return () => ctrl.abort();
  }, [courseId]);

  const selected = findCheckpoint(assignments, choice);
  // Evaluated as the modal renders, so a student who opens it before a deadline
  // and submits after it sees the notice appear. Matches the server's rule
  // exactly: no deadline is never late.
  const willBeLate = selected?.checkpoint.dueAt !== null && selected !== null
    ? Date.now() > selected.checkpoint.dueAt!
    : false;

  async function onMint() {
    setBusy(true);
    setError(null);
    try {
      const { token, createdAt } = await mintSubmission(
        documentId,
        courseId,
        selected
          ? { assignmentId: selected.assignment.id, checkpointId: selected.checkpoint.id }
          : undefined,
      );
      setSubs((cur) => [{ token, createdAt, revokedAt: null, canRevoke }, ...(cur ?? [])]);
      // Confirm in place. There's no URL to hand out anymore — only instructors
      // of this course can open a submission — so the old copy-to-clipboard
      // step would have put a link in the student's clipboard that nobody they
      // could send it to is able to view.
      setJustSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(token: string) {
    if (
      !(await confirm({
        title: "Revoke this link?",
        body: "Instructors holding it will immediately lose access to this snapshot.",
        confirmLabel: "Revoke",
      }))
    )
      return;
    try {
      await revokeSubmission(token);
      setSubs((cur) =>
        (cur ?? []).map((s) => (s.token === token ? { ...s, revokedAt: Date.now() } : s)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    }
  }

  const active = (subs ?? []).filter((s) => s.revokedAt === null);

  return (
    <div className="prov-modal-scrim" onClick={onClose}>
      <div
        className="prov-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share this document"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="prov-modal-title">Submit this document</h2>
        <p className="prov-modal-body">
          Submitting freezes a copy of your document as it is right now, showing
          where every word came from. Your instructor sees it; later edits won't
          change what was submitted. You can submit again as many times as you
          like — each submission is kept, so earlier versions aren't replaced.
        </p>

        {/* Hidden entirely when the course has no assignments — the modal then
            looks and behaves exactly as it did before they existed. */}
        {assignments.length > 0 && (
          <div className="prov-submit-target">
            <Field label="Submitting to" htmlFor="prov-submit-target">
              <Select
                id="prov-submit-target"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
              >
                <option value="">Not part of an assignment</option>
                {assignments.map((a) => (
                  <optgroup key={a.id} label={a.title}>
                    {a.checkpoints.map((c) => (
                      <option key={c.id} value={cellKey(a.id, c.id)}>
                        {c.name}
                        {c.dueAt !== null && ` — due ${formatDeadline(c.dueAt)}`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            {selected?.assignment.instructions && (
              <p className="muted small prov-submit-instructions">
                {selected.assignment.instructions}
              </p>
            )}
            {willBeLate && selected?.checkpoint.dueAt != null && (
              <p className="prov-submit-late" role="status">
                This is after the {formatDeadline(selected.checkpoint.dueAt)}{" "}
                deadline. You can still submit; it will be marked late.
              </p>
            )}
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <Button
          variant="primary"
          icon={<ShareIcon size={16} />}
          onClick={onMint}
          loading={busy}
          disabled={busy}
        >
          {active.length > 0 ? "Submit again" : "Submit to instructor"}
        </Button>

        {justSubmitted && (
          <p className="prov-submit-ok" role="status">
            Submitted. Your instructor can now see this version.
          </p>
        )}

        <div className="prov-submit-history">
          <SubLabel>Your submissions</SubLabel>
          {subs === null ? (
            <p className="muted small prov-share-list-note">Loading…</p>
          ) : subs.length === 0 ? (
            <p className="muted small prov-share-list-note">
              Nothing submitted yet.
            </p>
          ) : (
            <ul className="prov-submit-list">
              {subs.map((s, i) => (
                <li
                  key={s.token}
                  className={s.revokedAt !== null ? "is-revoked" : undefined}
                >
                  <span className="prov-submit-when">
                    {absoluteTime(s.createdAt)}
                  </span>
                  <span className="prov-submit-ago muted small">
                    {relativeTime(s.createdAt)}
                    {i === 0 && subs.length > 1 && " · latest"}
                    {s.revokedAt !== null && " · withdrawn by instructor"}
                  </span>
                  {s.canRevoke && s.revokedAt === null && (
                    <Button variant="danger" size="sm" onClick={() => onRevoke(s.token)}>
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="prov-modal-actions">
          <span className="prov-modal-actions-spacer" />
          <Button variant="subtle" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
