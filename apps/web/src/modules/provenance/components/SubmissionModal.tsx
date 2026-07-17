// Share modal (slice 6). Mint an unguessable share link that opens the
// document's frozen, colored, read-only view at /s/:token — no sign-in
// needed for whoever holds the link. Existing links can be copied or
// revoked here.

import { useEffect, useState } from "react";
import {
  listSubmissions,
  mintSubmission,
  revokeSubmission,
  type SubmissionSummary,
} from "../api.js";
import { Button, Input, useConfirm } from "../../../components/index.js";
import { ShareIcon } from "../../../icons.js";

interface Props {
  documentId: string;
  courseId: string;
  /** Whether the viewer may revoke links. Students can't (their shares are
   *  permanent); the worker enforces the same rule. */
  canRevoke: boolean;
  onClose: () => void;
}

function shareUrl(token: string): string {
  return `${window.location.origin}/s/${token}`;
}

export function SubmissionModal({ documentId, courseId, canRevoke, onClose }: Props) {
  const [subs, setSubs] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
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
      await copy(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create link");
    } finally {
      setBusy(false);
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
    } catch {
      /* clipboard may be blocked; the URL is still visible to select */
    }
  }

  async function onRevoke(token: string) {
    if (
      !(await confirm({
        title: "Revoke this link?",
        body: "Anyone holding it will immediately lose access.",
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
        <h2 className="prov-modal-title">Share this document</h2>
        <p className="prov-modal-body">
          A share link opens a frozen, read-only copy showing where every
          word came from. The snapshot is taken now — later edits won't
          change what the link shows. Revoke any time.
        </p>

        {error && <p className="error">{error}</p>}

        <Button
          variant="primary"
          icon={<ShareIcon size={16} />}
          onClick={onMint}
          loading={busy}
          disabled={busy}
        >
          Create share link
        </Button>

        {subs === null ? (
          <p className="muted small prov-share-list-note">Loading existing links…</p>
        ) : active.length === 0 ? (
          <p className="muted small prov-share-list-note">No active links yet.</p>
        ) : (
          <ul className="prov-share-list">
            {active.map((s) => (
              <li key={s.token}>
                <Input
                  className="prov-share-url"
                  mono
                  readOnly
                  value={shareUrl(s.token)}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button variant="subtle" size="sm" onClick={() => copy(s.token)}>
                  {copied === s.token ? "Copied" : "Copy"}
                </Button>
                {s.canRevoke && (
                  <Button variant="danger" size="sm" onClick={() => onRevoke(s.token)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

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
