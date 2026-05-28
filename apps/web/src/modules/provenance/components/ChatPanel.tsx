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

interface Props {
  documentId: string;
  courseId: string;
  onInsertAtCursor?: (text: string, sourceMessageId: string) => void;
}

interface PendingAssistant { text: string }

export function ChatPanel({ documentId, courseId, onInsertAtCursor }: Props) {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [conversations, setConversations] = useState<ConversationDTO[] | null>(null);
  const [active, setActive] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [pendingAsst, setPendingAsst] = useState<PendingAssistant | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const abortStreamRef = useRef<(() => void) | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // ── Load agents + conversations on mount / doc change ────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      listAgents(courseId, ctrl.signal),
      listConversations(documentId, courseId, ctrl.signal),
    ])
      .then(([a, c]) => {
        if (ctrl.signal.aborted) return;
        setAgents(a);
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
    const content = draft.trim();
    if (!content || !active || pendingAsst) return;
    setError(null);
    setDraft("");
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
    });
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
        <button
          type="button"
          className="link-button subtle prov-chat-new"
          onClick={() => setShowAgentPicker((v) => !v)}
          disabled={busy || agents === null}
          title="Start a new conversation"
        >
          New
        </button>
        {active && (
          <button
            type="button"
            className="prov-chat-icon-button"
            onClick={() => onDeleteConversation(active.id)}
            aria-label="Delete this conversation"
            title="Delete this conversation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </header>

      {showAgentPicker && agents && (
        <div className="prov-chat-agent-picker">
          {agents.length === 0 ? (
            <p className="muted small">No agents yet. Visit <a href="/write/agents">My agents</a> to add one.</p>
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
          <button
            type="button"
            className="link-button"
            onClick={() => setShowAgentPicker(true)}
            disabled={agents === null}
          >
            Start a conversation
          </button>
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
            <div className={`prov-composer-field${draft.trim() && !pendingAsst ? " can-send" : ""}`}>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="prov-send-button"
                  onClick={send}
                  disabled={!draft.trim()}
                  aria-label="Send"
                  title="Send"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
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
          <button
            type="button"
            className="link-button subtle prov-bubble-insert"
            onClick={onInsert}
          >
            Insert at cursor
          </button>
        </div>
      )}
    </div>
  );
}
