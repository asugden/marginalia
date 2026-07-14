// Side-panel chat for a provenance document.
// Picks an agent, supports many conversations per document (for
// context-window juggling), streams responses, exposes per-assistant
// "Insert at cursor" for slice 4. Visual treatment mirrors the
// conversation page composer + bubble pattern.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createConversation,
  deleteConversation,
  listAgents,
  listConversations,
  listMessages,
  streamChatTurn,
  type AgentSummary,
  type ConversationDTO,
  type MessageDTO,
} from "../api.js";
import { useByoKey, maskKey } from "./useByoKey.js";
import { Button, Field, Input } from "../../../components/index.js";
import { KeyIcon, SendIcon, StopIcon, TrashIcon } from "../../../icons.js";

interface Props {
  documentId: string;
  courseId: string;
  onInsertAtCursor?: (text: string, sourceMessageId: string) => void;
  /** Hands an imperative handle to the parent so the editor's "Reference"
   *  action can push a selected passage into the composer as a quote chip. */
  onReady?: (api: { addReference: (text: string) => void }) => void;
}

interface PendingAssistant { text: string }

interface RefChip { id: string; text: string }

// The built-in default voice, always offered first in the agent picker so a
// fresh course (no instructor-authored chat agents) still has a working tutor.
// The id is resolved server-side from the shared voice library.
const SOCRATIC_DEFAULT: AgentSummary = {
  id: "builtin:socratic",
  name: "Socratic",
  mine: false,
};

export function ChatPanel({ documentId, courseId, onInsertAtCursor, onReady }: Props) {
  const [refs, setRefs] = useState<RefChip[]>([]);
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [conversations, setConversations] = useState<ConversationDTO[] | null>(null);
  const [active, setActive] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [pendingAsst, setPendingAsst] = useState<PendingAssistant | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const byo = useByoKey();

  const abortStreamRef = useRef<(() => void) | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const refSeqRef = useRef(0);

  // Expose addReference to the parent (the editor's select-to-reference action).
  useEffect(() => {
    if (!onReady) return;
    onReady({
      addReference(text: string) {
        const clean = String(text).replace(/\s+/g, " ").trim();
        if (!clean) return;
        setRefs((cur) =>
          cur.some((r) => r.text === clean)
            ? cur
            : [...cur, { id: `ref_${++refSeqRef.current}`, text: clean }],
        );
        // Bring focus to the composer so the student can type around the quote.
        setTimeout(() => composerRef.current?.focus(), 0);
      },
    });
  }, [onReady]);

  function removeRef(id: string) {
    setRefs((cur) => cur.filter((r) => r.id !== id));
  }

  // ── Load agents + conversations on mount / doc change ────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      listAgents(courseId, ctrl.signal),
      listConversations(documentId, courseId, ctrl.signal),
    ])
      .then(([a, c]) => {
        if (ctrl.signal.aborted) return;
        // Always offer the built-in Socratic voice as a default, first in the
        // list, so a fresh course (no instructor-authored chat agents) still
        // has something to talk to. The worker resolves "builtin:socratic" from
        // the shared voice library — see createConversationRoute.
        const withDefault = [
          SOCRATIC_DEFAULT,
          ...a.filter((x) => x.id !== SOCRATIC_DEFAULT.id),
        ];
        setAgents(withDefault);
        setConversations(c);
        if (c.length > 0) setActive((cur) => cur ?? c[0]!);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [documentId, courseId]);

  // ── Load messages whenever the active conversation changes ────────────
  // Also abort any in-flight stream when the user switches conversations
  // mid-reply so the second conversation's history doesn't get scrambled.
  useEffect(() => {
    abortStreamRef.current?.();
    abortStreamRef.current = null;
    setPendingAsst(null);
    if (!active) {
      setMessages([]);
      return;
    }
    const ctrl = new AbortController();
    listMessages(active.id, courseId, ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        setMessages(m);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [active, courseId]);

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pendingAsst]);

  // Tear down any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortStreamRef.current?.();
      abortStreamRef.current = null;
    };
  }, []);

  const startConversation = useCallback(
    async (agentId: string) => {
      setError(null);
      setBusy(true);
      try {
        const conv = await createConversation(documentId, courseId, agentId);
        setConversations((cur) => [conv, ...(cur ?? [])]);
        setActive(conv);
        setShowAgentPicker(false);
        // Focus composer so the student can type right away.
        setTimeout(() => composerRef.current?.focus(), 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start conversation");
      } finally {
        setBusy(false);
      }
    },
    [documentId, courseId],
  );

  async function onDeleteConversation(id: string) {
    if (!confirm("Delete this conversation?")) return;
    try {
      await deleteConversation(courseId, id);
      setConversations((cur) => (cur ?? []).filter((c) => c.id !== id));
      if (active?.id === id) setActive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function send() {
    const typed = draft.trim();
    // Sendable if there's typed text OR at least one referenced passage.
    if ((!typed && refs.length === 0) || !active || pendingAsst) return;
    setError(null);
    setDraft("");
    const refsNow = refs.map((r) => r.text);
    setRefs([]);
    // Carry referenced passages into the message as a leading blockquote so
    // the agent (and the saved transcript) sees exactly what was quoted.
    const quoted = refsNow.map((t) => `> ${t}`).join("\n");
    const content = quoted ? (typed ? `${quoted}\n\n${typed}` : quoted) : typed;
    const optimisticUser: MessageDTO = {
      id: `local_${Date.now()}`,
      role: "user",
      content,
      seq: (messages[messages.length - 1]?.seq ?? -1) + 1,
      createdAt: Date.now(),
    };
    setMessages((cur) => [...cur, optimisticUser]);
    setPendingAsst({ text: "" });
    const conversationId = active.id;
    abortStreamRef.current = streamChatTurn(conversationId, courseId, content, {
      onDelta: (t) => {
        setPendingAsst((cur) => (cur ? { text: cur.text + t } : cur));
      },
      onDone: async () => {
        abortStreamRef.current = null;
        setPendingAsst(null);
        try {
          const fresh = await listMessages(conversationId, courseId);
          // Defensive: only apply if the user hasn't switched away.
          setMessages((cur) => (active?.id === conversationId ? fresh : cur));
          const convs = await listConversations(documentId, courseId);
          setConversations(convs);
          setActive((cur) =>
            cur?.id === conversationId
              ? (convs.find((c) => c.id === conversationId) ?? cur)
              : cur,
          );
        } catch {
          /* non-fatal — next reload will pick it up */
        }
      },
      onError: (msg) => {
        abortStreamRef.current = null;
        setPendingAsst(null);
        // Roll back the optimistic user message so we don't show a phantom turn.
        setMessages((cur) => cur.filter((m) => m.id !== optimisticUser.id));
        setError(msg);
      },
    }, byo.key);
  }

  function onAbort() {
    abortStreamRef.current?.();
    abortStreamRef.current = null;
    setPendingAsst(null);
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="prov-chat">
      <header className="prov-chat-header">
        {conversations && conversations.length > 0 ? (
          <select
            className="prov-chat-select"
            value={active?.id ?? ""}
            onChange={(e) => {
              const id = e.target.value;
              const conv = conversations.find((c) => c.id === id) ?? null;
              setActive(conv);
              setShowAgentPicker(false);
            }}
            aria-label="Conversation"
          >
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title ?? "(new)"} — {c.agentName}
              </option>
            ))}
          </select>
        ) : (
          <span className="prov-chat-header-blank">Chat</span>
        )}
        <Button
          variant="subtle"
          size="sm"
          className="prov-chat-new"
          onClick={() => setShowAgentPicker((v) => !v)}
          disabled={busy || agents === null}
          title="Start a new conversation"
        >
          New
        </Button>
        <button
          type="button"
          className={`prov-chat-icon-button${byo.active ? " is-active" : ""}`}
          onClick={() => setShowKeyModal(true)}
          aria-label={byo.active ? "Using your own LLM key" : "Use your own LLM key"}
          title={byo.active ? "Using your own key" : "Use your own key"}
        >
          <KeyIcon size={18} />
        </button>
        {active && (
          <button
            type="button"
            className="prov-chat-icon-button"
            onClick={() => onDeleteConversation(active.id)}
            aria-label="Delete this conversation"
            title="Delete this conversation"
          >
            <TrashIcon size={18} />
          </button>
        )}
      </header>

      {byo.active && (
        <div className="prov-chat-byo-banner">
          Using your own key (<code>{maskKey(byo.key!)}</code>).
          <button type="button" className="prov-chat-byo-banner-link" onClick={() => setShowKeyModal(true)}>
            Manage
          </button>
        </div>
      )}

      {showKeyModal && (
        <ByoKeyModal
          byo={byo}
          onClose={() => setShowKeyModal(false)}
        />
      )}

      {showAgentPicker && agents && (
        <div className="prov-chat-agent-picker">
          {agents.length === 0 ? (
            <p className="muted small">No agents yet. Visit <a href={`/course/${courseId}/write/agents`}>My agents</a> to add one.</p>
          ) : (
            <ul>
              {agents.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="prov-chat-agent-row"
                    disabled={busy}
                    onClick={() => startConversation(a.id)}
                  >
                    <span className="prov-chat-agent-name">{a.name}</span>
                    {a.mine && <span className="prov-chat-mine-pill">mine</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!active && !showAgentPicker && (
        <div className="prov-chat-empty">
          <p className="muted">
            Pick an agent to start chatting. Anything you ask is logged
            with the document — the instructor can read it if you share
            this document later.
          </p>
          <Button
            variant="primary"
            onClick={() => setShowAgentPicker(true)}
            disabled={agents === null}
          >
            Start a conversation
          </Button>
        </div>
      )}

      {active && (
        <>
          <div className="prov-chat-scroll" ref={scrollerRef}>
            {messages.map((m) => (
              <ChatBubble
                key={m.id}
                role={m.role}
                content={m.content}
                onInsert={
                  m.role === "assistant" && onInsertAtCursor && !m.id.startsWith("local_")
                    ? () => onInsertAtCursor(m.content, m.id)
                    : undefined
                }
              />
            ))}
            {pendingAsst && (
              <ChatBubble role="assistant" content={pendingAsst.text} pending />
            )}
          </div>

          <div className="prov-chat-composer">
            {refs.length > 0 && (
              <div className="prov-composer-refs">
                {refs.map((r) => (
                  <span key={r.id} className="prov-ref-chip">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M7 7h4v4c0 2.2-1.3 3.7-3.5 4.3l-.5-1.3c1.3-.4 2-1.1 2-2H7V7zm6 0h4v4c0 2.2-1.3 3.7-3.5 4.3l-.5-1.3c1.3-.4 2-1.1 2-2h-2V7z" />
                    </svg>
                    <span className="prov-ref-chip-text">{r.text}</span>
                    <button
                      type="button"
                      className="prov-ref-chip-x"
                      onClick={() => removeRef(r.id)}
                      aria-label="Remove reference"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className={`prov-composer-field${(draft.trim() || refs.length > 0) && !pendingAsst ? " can-send" : ""}`}>
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Message…"
                rows={1}
                disabled={!!pendingAsst}
              />
              {pendingAsst ? (
                <button
                  type="button"
                  className="prov-stop-button"
                  onClick={onAbort}
                  aria-label="Stop streaming"
                  title="Stop"
                >
                  <StopIcon size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="prov-send-button"
                  onClick={send}
                  disabled={!draft.trim() && refs.length === 0}
                  aria-label="Send"
                  title="Send"
                >
                  <SendIcon size={18} />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {error && <p className="prov-chat-error">{error}</p>}
    </div>
  );
}

function ByoKeyModal({
  byo,
  onClose,
}: {
  byo: ReturnType<typeof useByoKey>;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");

  function save() {
    if (!value.trim()) return;
    byo.setKey(value);
    setValue("");
    onClose();
  }

  return (
    <div className="prov-modal-scrim" onClick={onClose}>
      <div
        className="prov-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Use your own LLM key"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="prov-modal-title">Use your own LLM key</h2>
        <p className="prov-modal-body">
          Paste your own provider API key and the chat will use it instead
          of your institution's. Your key is stored only in this browser
          and is sent only with each chat request — it is never saved on
          the server.
        </p>

        {byo.active ? (
          <div className="prov-modal-current">
            <span className="muted small">Current key</span>
            <code>{maskKey(byo.key!)}</code>
          </div>
        ) : null}

        <Field label={byo.active ? "Replace with a new key" : "API key"}>
          <Input
            mono
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-…"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); save(); }
            }}
          />
        </Field>

        <div className="prov-modal-actions">
          {byo.active && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => { byo.clear(); onClose(); }}
            >
              Stop using my key
            </Button>
          )}
          <span className="prov-modal-actions-spacer" />
          <Button variant="subtle" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!value.trim()}>
            Save key
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  role,
  content,
  pending,
  onInsert,
}: {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  onInsert?: () => void;
}) {
  return (
    <div className={`prov-bubble prov-bubble-${role}${pending ? " is-pending" : ""}`}>
      <div className="prov-bubble-body">{content || (pending ? "…" : "")}</div>
      {onInsert && (
        <div className="prov-bubble-actions">
          <Button
            variant="ghost"
            size="sm"
            className="prov-bubble-insert"
            onClick={onInsert}
          >
            Insert at cursor
          </Button>
        </div>
      )}
    </div>
  );
}
