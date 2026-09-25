// The AI chat beside a notebook. Present only when the assignment has the
// chat turned on; the server enforces the same rule on every turn.
//
// There is no "insert into notebook" button on AI replies, on purpose:
// the AI chat is there to help a student write the code, not to supply it.
// The chat styling is the shared provenance chat pane's, so the two tools
// read as one product.

import { useEffect, useRef, useState } from "react";
import { Markdown } from "../../../Markdown.js";
import { SendIcon, StopIcon } from "../../../icons.js";
import {
  isAuthError,
  listMessages,
  redirectToLogin,
  streamChatPreview,
  streamChatTurn,
  type CodeMessageDTO,
} from "../api.js";

/** Which conversation the panel is. A student's notebook keeps its thread on
 *  the server; the instructor's starter preview keeps nothing. */
export type ChatTarget =
  | { kind: "notebook"; notebookId: string }
  | { kind: "preview"; assignmentId: string };

export function NotebookChatPanel({
  courseId,
  target,
  focusLabel,
  focusCellId,
  onClearFocus,
  beforeSend,
  onReply,
}: {
  courseId: string;
  target: ChatTarget;
  /** "Cell 3" when the student has a cell selected, else null. */
  focusLabel: string | null;
  focusCellId: string | null;
  onClearFocus: () => void;
  /** Flush the notebook save, so the AI chat reads what the student sees. */
  beforeSend: () => Promise<void>;
  /** Every assistant reply, including those loaded from history, so the
   *  notebook can recognise AI chat text if it turns up in a cell. */
  onReply?: (text: string) => void;
}) {
  const preview = target.kind === "preview";
  const targetKey = target.kind === "notebook" ? target.notebookId : target.assignmentId;
  const [messages, setMessages] = useState<CodeMessageDTO[] | null>(preview ? [] : null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  useEffect(() => {
    if (target.kind !== "notebook") return;
    let live = true;
    listMessages(courseId, target.notebookId)
      .then((m) => {
        if (!live) return;
        setMessages(m);
        for (const msg of m) if (msg.role === "assistant") onReplyRef.current?.(msg.content);
      })
      .catch((e) => {
        if (isAuthError(e)) redirectToLogin();
        else if (live) setError(e instanceof Error ? e.message : "Couldn't load the conversation");
      });
    return () => {
      live = false;
      abortRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, targetKey]);

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
      // Sending still works; the AI chat just reads the last successful save.
    }
    let acc = "";
    const callbacks = {
      onDelta: (d: string) => {
        acc += d;
        setPending(acc);
      },
      onDone: ({ assistantMessageId }: { assistantMessageId?: string }) => {
        const reply = acc.trim();
        setMessages((cur) => [
          ...(cur ?? []),
          { id: assistantMessageId ?? `preview_${Date.now()}`, role: "assistant", content: reply, createdAt: Date.now() },
        ]);
        onReplyRef.current?.(reply);
        setPending(null);
        abortRef.current = null;
      },
      onError: (m: string) => {
        setError(m);
        setPending(null);
        abortRef.current = null;
      },
      onAuthRequired: () => redirectToLogin(),
    };
    if (target.kind === "notebook") {
      abortRef.current = streamChatTurn(courseId, target.notebookId, text, focusCellId, callbacks);
    } else {
      const history = (messages ?? []).map((m) => ({ role: m.role, content: m.content }));
      abortRef.current = streamChatPreview(courseId, target.assignmentId, text, history, focusCellId, callbacks);
    }
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
    <div className="prov-chat code-chat">
      <div className="code-side__head">
        <span className="code-side__title">{preview ? "Chat preview" : "Chat"}</span>
      </div>
      <div className="prov-chat-scroll" ref={scroller}>
        {messages === null ? (
          <p className="code-chat__hint">Loading…</p>
        ) : messages.length === 0 && pending === null ? (
          <p className="code-chat__hint">
            {preview
              ? "Try the chat your students will get. It reads the starter notebook as last saved, with this assignment's instructions and your guidance. Nothing here is saved or shown to students."
              : "Ask about an error, a concept, or what to try next. The chat can see your notebook and its outputs. It won't write the assignment for you."}
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
            placeholder="Ask a question…"
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
      <div className="prov-bubble-body code-chat__body">
        {role === "assistant" ? (content ? <Markdown>{content}</Markdown> : "…") : content}
      </div>
    </div>
  );
}
