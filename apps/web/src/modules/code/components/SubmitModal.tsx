// Submit modal for a code assignment — the same surface a student sees when
// submitting a writing document (provenance's SubmissionModal): what
// submitting means, the deadline notice when it's already past, the submit
// button, and WHEN each previous version went in. Students resubmit
// repeatedly (often right up to a deadline) and need to see what's already
// in. Each submission is a separate immutable row; resubmitting never
// replaces one, and a student can't un-submit.
//
// Unlike the writing modal there is no checkpoint picker: a notebook belongs
// to exactly one assignment, so there is nothing to choose. A submission past
// the deadline is ACCEPTED — the notice exists so nobody is surprised by a
// LATE label they had no way to anticipate, not to discourage submitting.
//
// The mechanics of submitting (flushing pending saves and origin events
// before the snapshot) belong to NotebookPage and arrive here as `onSubmit`.

import { useEffect, useState } from "react";
import { listMySubmissions, type SubmissionSummaryDTO } from "../api.js";
import { Button, SubmissionHistory } from "../../../components/index.js";
import { absoluteTime } from "../../../time.js";
import { ShareIcon } from "../../../icons.js";

interface Props {
  courseId: string;
  notebookId: string;
  /** Whether the chat conversation travels with the copy — changes the copy text. */
  aiEnabled: boolean;
  /** The assignment's deadline, for the late notice. Null = never late. */
  dueAt: number | null;
  /** Flushes pending saves/events, submits, and returns the new submission. */
  onSubmit: () => Promise<SubmissionSummaryDTO>;
  onClose: () => void;
}

export function SubmitModal({ courseId, notebookId, aiEnabled, dueAt, onSubmit, onClose }: Props) {
  const [subs, setSubs] = useState<SubmissionSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    let live = true;
    listMySubmissions(courseId, notebookId)
      .then((s) => { if (live) setSubs(s); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Load failed"); });
    return () => { live = false; };
  }, [courseId, notebookId]);

  // Evaluated as the modal renders, so a student who opens it before the
  // deadline and submits after it sees the notice appear. Matches the
  // server's rule exactly: no deadline is never late.
  const willBeLate = dueAt !== null && Date.now() > dueAt;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const s = await onSubmit();
      setSubs((cur) => [s, ...(cur ?? [])]);
      setJustSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prov-modal-scrim" onClick={onClose}>
      <div
        className="prov-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Submit this notebook"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="prov-modal-title">Submit this notebook</h2>
        <p className="prov-modal-body">
          Submitting freezes a copy of your notebook as it is right now, with
          its outputs{aiEnabled ? " and your chat conversation" : ""}, showing
          where its code and text came from: typed, pasted, from the LLM chat,
          or provided in the starter. Your instructor sees it; later edits
          won't change what was submitted. You can submit again as many times
          as you like — each submission is kept, so earlier versions aren't
          replaced. Uploaded files are not included.
        </p>

        {willBeLate && dueAt !== null && (
          <div className="prov-submit-target">
            <p className="prov-submit-late" role="status">
              This is after the {absoluteTime(dueAt)} deadline. You can still
              submit; it will be marked late.
            </p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <Button
          variant="primary"
          icon={<ShareIcon size={16} />}
          onClick={() => void submit()}
          loading={busy}
          disabled={busy}
        >
          {(subs ?? []).length > 0 ? "Submit again" : "Submit to instructor"}
        </Button>

        {justSubmitted && (
          <p className="prov-submit-ok" role="status">
            Submitted. Your instructor can now see this version.
          </p>
        )}

        <SubmissionHistory
          rows={subs === null ? null : subs.map((s) => ({ key: s.id, at: s.submittedAt }))}
        />

        <div className="prov-modal-actions">
          <span className="prov-modal-actions-spacer" />
          <Button variant="subtle" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
