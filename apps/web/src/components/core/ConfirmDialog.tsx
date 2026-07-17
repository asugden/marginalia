// ConfirmDialog — a designed replacement for window.confirm(). A dimmed
// backdrop over a centered card with a title, body, and confirm/cancel actions.
// Use this (never the native confirm/alert) for any destructive or blocking
// prompt.
//
// Styles live in ../components.css (.ds-modal-*). Authored against the generic
// token layer — no brand-specific colour literal appears.

import type { ReactNode } from "react";
import { Button } from "./Button.js";
import { Modal } from "./Modal.js";

export interface ConfirmDialogProps {
  title: string;
  /** Body copy explaining the consequence. */
  body?: ReactNode;
  /** Confirm button label. Default "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Default "Cancel". */
  cancelLabel?: string;
  /** Destructive styling on the confirm button. Default true. */
  danger?: boolean;
  /** Notice mode: a single acknowledge button, no cancel. */
  notice?: boolean;
  /** Show a spinner on the confirm button and block interaction. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  notice = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} busy={loading} onClose={notice ? onConfirm : onCancel} maxWidth="26rem">
      <h2 className="ds-modal-title">{title}</h2>
      {body && <div className="ds-modal-body">{body}</div>}
      <div className="ds-modal-actions">
        <span className="ds-modal-actions-spacer" />
        {!notice && (
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
        )}
        <Button
          variant={danger ? "danger" : "primary"}
          size="sm"
          onClick={onConfirm}
          loading={loading}
          disabled={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
