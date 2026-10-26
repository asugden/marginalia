// The inline name editor staff use on session and board rows.

import { useState } from "react";
import { Button, Input } from "../../../components/index.js";

export function RenameForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      className="q-new"
      onSubmit={async (e) => {
        e.preventDefault();
        if (draft.trim()) await onSave(draft.trim());
      }}
    >
      <Input
        aria-label="Name"
        value={draft}
        maxLength={120}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button type="submit" variant="primary" size="sm" disabled={!draft.trim()}>
        Save
      </Button>
      <Button variant="subtle" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

/** A one-field "name it and create it" form. */
export function CreateForm({
  label,
  placeholder,
  onCreate,
}: {
  label: string;
  placeholder: string;
  onCreate: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="q-new"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        setBusy(true);
        try {
          await onCreate(t);
          setTitle("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Button type="submit" variant="primary" loading={busy} disabled={busy || !title.trim()}>
        New
      </Button>
    </form>
  );
}
