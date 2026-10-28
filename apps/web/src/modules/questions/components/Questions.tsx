// The question parts of a board: the box to ask one, and one question with
// its controls. Questions carry no names, for anyone. A person's own are
// marked "Yours" (to them alone) and stay editable until the session closes;
// staff can hide or delete any of them.

import { useState } from "react";
import {
  Badge,
  Button,
  Textarea,
  type useConfirm,
} from "../../../components/index.js";
import { relativeTime } from "../../../time.js";
import {
  ApiError,
  askQuestion,
  deleteQuestion,
  updateQuestion,
  type EntryDTO,
} from "../api.js";

const MAX_CHARS = 1_000;

export function Composer({
  boardId,
  onAsked,
}: {
  boardId: string;
  onAsked: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await askQuestion(boardId, body);
      setText("");
      onAsked();
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "session_closed"
          ? "The session just closed, so your question wasn't added."
          : (e as Error).message,
      );
      if (e instanceof ApiError && e.code === "session_closed") onAsked();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="q-compose">
      <Textarea
        aria-label="Your question"
        placeholder="Ask a question…"
        rows={3}
        maxLength={MAX_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!busy) void submit();
          }
        }}
      />
      <div className="q-compose__foot">
        <span className="q-compose__note">
          Your question will be anonymous.
        </span>
        <Button
          variant="primary"
          onClick={submit}
          loading={busy}
          disabled={busy || !text.trim()}
        >
          Ask
        </Button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function QuestionRow({
  entry,
  open,
  staff,
  onChanged,
  onError,
  confirm,
}: {
  entry: EntryDTO;
  open: boolean;
  staff: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
  confirm: ReturnType<typeof useConfirm>["confirm"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canEdit = entry.mine && open;
  const canDelete = (entry.mine && open) || staff;

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this question?",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) await run(() => deleteQuestion(entry.id));
  };

  return (
    <li className={"q-item" + (entry.hidden ? " q-item--hidden" : "")}>
      {editing ? (
        <div className="q-item__edit">
          <Textarea
            aria-label="Edit your question"
            rows={3}
            maxLength={MAX_CHARS}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="q-item__actions">
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={busy || !draft.trim()}
              onClick={() =>
                run(async () => {
                  await updateQuestion(entry.id, { body: draft });
                  setEditing(false);
                })
              }
            >
              Save
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                setDraft(entry.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="q-item__body">{entry.body}</p>
      )}
      <div className="q-item__meta">
        <span className="q-item__when">{relativeTime(entry.createdAt)}</span>
        {entry.mine && <Badge tone="info">Yours</Badge>}
        {entry.hidden && <Badge tone="warning">Hidden from class</Badge>}
        {!editing && (
          <span className="q-item__actions">
            {canEdit && (
              <Button
                variant="subtle"
                size="sm"
                onClick={() => {
                  setDraft(entry.body);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            )}
            {staff && (
              <Button
                variant="subtle"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => updateQuestion(entry.id, { hidden: !entry.hidden }))
                }
              >
                {entry.hidden ? "Show" : "Hide"}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={remove}
              >
                Delete
              </Button>
            )}
          </span>
        )}
      </div>
    </li>
  );
}
