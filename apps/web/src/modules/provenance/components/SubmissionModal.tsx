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

import { useEffect, useState } from "react";
import {
  listSubmissions,
  mintSubmission,
  revokeSubmission,
  type SubmissionSummary,
} from "../api.js";
import { Button, SubLabel, useConfirm } from "../../../components/index.js";
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

export function SubmissionModal({ documentId, courseId, canRevoke, onClose }: Props) {
  const [subs, setSubs] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    const ctrl = new AbortController();
    listSubmissions(documentId, courseId, ctrl.signal)
      .then((s) => { if (!ctrl.signal.aborted) setSubs(s); })
      .catch((e) => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Load failed"); });
    return () => ctrl.abort();
  }, [documentId, courseId]);

  async function onMint() {
    setBusy(true);
    setError(null);
    try {
      const { token, createdAt } = await mintSubmission(documentId, courseId);
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
