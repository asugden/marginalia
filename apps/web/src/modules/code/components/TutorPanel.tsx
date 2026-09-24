// The AI tutor beside a notebook. Present only when the assignment has the
// tutor turned on; the server enforces the same rule on every turn.
//
// There is no "insert into notebook" button on tutor replies, on purpose:
// the tutor is there to help a student write the code, not to supply it.
// The chat styling is the shared provenance chat pane's, so the two tools
// read as one product.

import { useEffect, useRef, useState } from "react";
import { Markdown } from "../../../Markdown.js";
import { SendIcon, StopIcon } from "../../../icons.js";
import {
  isAuthError,
  listMessages,
  redirectToLogin,
  streamTutorTurn,
  type CodeMessageDTO,
} from "../api.js";

export function TutorPanel({
  courseId,
  notebookId,
  focusLabel,
  focusCellId,
  onClearFocus,
  beforeSend,
}: {
  courseId: string;
  notebookId: string;
  /** "Cell 3" when the student has a cell selected, else null. */
  focusLabel: string | null;
  focusCellId: string | null;
  onClearFocus: () => void;
  /** Flush the notebook save, so the tutor reads what the student sees. */
  beforeSend: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<CodeMessageDTO[] | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    listMessages(courseId, notebookId)
      .then((m) => live && setMessages(m))
      .catch((e) => {
        if (isAuthError(e)) redirectToLogin();
        else if (live) setError(e instanceof Error ? e.message : "Couldn't load the conversation");
      });
    return () => {
      live = false;
      abortRef.current?.();
    };
  }, [courseId, notebookId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, pending]);

  async function send() {
    const text = draft.trim();
    if (!text || pending !== null) return;
    setError(null);
    setDraft("");
    const local: CodeMessageDTO = { id: `local_${Date.now()}`, role: "user", content: text, createdAt: Date.now() };
    setMessages((cur) => [...(cur ?? []), local]);
    setPending("");
    try {
      await beforeSend();
    } catch {
      // Sending still works; the tutor just reads the last successful save.
    }
    let acc = "";
    abortRef.current = streamTutorTurn(courseId, notebookId, text, focusCellId, {
      onDelta: (d) => {
        acc += d;
        setPending(acc);
      },
      onDone: ({ assistantMessageId }) => {
        setMessages((cur) => [
          ...(cur ?? []),
          { id: assistantMessageId, role: "assistant", content: acc.trim(), createdAt: Date.now() },
        ]);
        setPending(null);
        abortRef.current = null;
      },
      onError: (m) => {
        setError(m);
        setPending(null);
        abortRef.current = null;
      },
      onAuthRequired: () => redirectToLogin(),
    });
  }

  function stop() {
    abortRef.current?.();
    abortRef.current = null;
    if (pending) {
      setMessages((cur) => [
        ...(cur ?? []),
        { id: `local_a_${Date.now()}`, role: "assistant", content: pending + " …", createdAt: Date.now() },
      ]);
    }
    setPending(null);
  }

  return (
    <div className="prov-chat code-tutor">
      <div className="code-side__head">
        <span className="code-side__title">Tutor</span>
      </div>
      <div className="prov-chat-scroll" ref={scroller}>
        {messages === null ? (
          <p className="code-tutor__hint">Loading…</p>
        ) : messages.length === 0 && pending === null ? (
          <p className="code-tutor__hint">
            Ask about an error, a concept, or what to try next. The tutor can
            see your notebook and its outputs, but it won't write the
            assignment for you.
          </p>
        ) : null}
        {messages?.map((m) => <Bubble key={m.id} role={m.role} content={m.content} />)}
        {pending !== null && <Bubble role="assistant" content={pending} pending />}
      </div>
      <div className="prov-chat-composer">
        {focusLabel && (
          <div className="prov-composer-refs">
            <span className="prov-ref-chip">
              <span className="prov-ref-chip-text">Asking about {focusLabel}</span>
              <button type="button" className="prov-ref-chip-x" onClick={onClearFocus} aria-label="Stop pointing at this cell">
                ×
              </button>
            </span>
          </div>
        )}
        <div className={`prov-composer-field${draft.trim() && pending === null ? " can-send" : ""}`}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask the tutor…"
            rows={1}
            disabled={pending !== null}
          />
          {pending !== null ? (
            <button type="button" className="prov-stop-button" onClick={stop} aria-label="Stop" title="Stop">
              <StopIcon size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="prov-send-button"
              onClick={() => void send()}
              disabled={!draft.trim()}
              aria-label="Send"
              title="Send"
            >
              <SendIcon size={18} />
            </button>
          )}
        </div>
      </div>
      {error && <p className="prov-chat-error">{error}</p>}
    </div>
  );
}

function Bubble({ role, content, pending }: { role: "user" | "assistant"; content: string; pending?: boolean }) {
  return (
    <div className={`prov-bubble prov-bubble-${role}${pending ? " is-pending" : ""}`}>
      <div className="prov-bubble-body code-tutor__body">
        {role === "assistant" ? (content ? <Markdown>{content}</Markdown> : "…") : content}
      </div>
    </div>
  );
}
