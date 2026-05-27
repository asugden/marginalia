// Side-panel chat for a provenance document.
// Slice 3 wires: agent picker, per-document conversation list (many
// allowed for context-window juggling), streamed messages, and a
// stubbed "Insert at cursor" button (the actual insert lands in slice 4).

import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_COURSE } from "../../../course.js";
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
  /** Slice 4 will lift this to actually insert into the editor at the cursor. */
  onInsertAtCursor?: (text: string, sourceMessageId: string) => void;
}

interface PendingAssistant {
  text: string;
}

export function ChatPanel({ documentId, onInsertAtCursor }: Props) {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [conversations, setConversations] = useState<ConversationDTO[] | null>(null);
  const [active, setActive] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [pendingAsst, setPendingAsst] = useState<PendingAssistant | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const abortStreamRef = useRef<(() => void) | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // ── Load agents + conversations on mount / doc change ────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      listAgents(DEMO_COURSE, ctrl.signal),
      listConversations(documentId, DEMO_COURSE, ctrl.signal),
    ])
      .then(([a, c]) => {
        setAgents(a);
        setConversations(c);
        if (c.length > 0 && active === null) setActive(c[0]!);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // ── Load messages whenever the active conversation changes ────────────
  useEffect(() => {
    if (!active) {
      setMessages([]);
      return;
    }
    const ctrl = new AbortController();
    listMessages(active.id, DEMO_COURSE, ctrl.signal)
      .then(setMessages)
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [active]);

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pendingAsst]);

  // Tear down any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortStreamRef.current?.();
    };
  }, []);

  async function onStartConversation(agentId: string) {
    setError(null);
    setBusy(true);
    try {
      const conv = await createConversation(documentId, DEMO_COURSE, agentId);
      setConversations((cur) => [conv, ...(cur ?? [])]);
      setActive(conv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start conversation");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteConversation(id: string) {
    if (!confirm("Delete this conversation?")) return;
    try {
      await deleteConversation(DEMO_COURSE, id);
      setConversations((cur) => (cur ?? []).filter((c) => c.id !== id));
      if (active?.id === id) setActive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function onSend() {
    const content = draft.trim();
    if (!content || !active || pendingAsst) return;
    setError(null);
    setDraft("");
    // Optimistic user message — server will assign the real id on commit; we
    // re-fetch the conversation's messages on `done` to pick up canonical rows.
    const optimisticUser: MessageDTO = {
      id: `local_${Date.now()}`,
      role: "user",
      content,
      seq: (messages[messages.length - 1]?.seq ?? -1) + 1,
      createdAt: Date.now(),
    };
    setMessages((cur) => [...cur, optimisticUser]);
    setPendingAsst({ text: "" });
    abortStreamRef.current = streamChatTurn(active.id, DEMO_COURSE, content, {
      onDelta: (t) => {
        setPendingAsst((cur) => (cur ? { text: cur.text + t } : cur));
      },
      onDone: async () => {
        abortStreamRef.current = null;
        setPendingAsst(null);
        try {
          const fresh = await listMessages(active.id, DEMO_COURSE);
          setMessages(fresh);
          // Refresh conversation list so the (possibly newly-stamped) title shows.
          const convs = await listConversations(documentId, DEMO_COURSE);
          setConversations(convs);
          const refreshedActive = convs.find((c) => c.id === active.id);
          if (refreshedActive) setActive(refreshedActive);
        } catch {
          /* non-fatal — the next reload will pick it up */
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

  return (
    <aside className="provenance-chat">
      <header className="provenance-chat-header">
        <select
          value={active?.id ?? ""}
          onChange={(e) => {
            const id = e.target.value;
            const conv = conversations?.find((c) => c.id === id) ?? null;
            setActive(conv);
          }}
          aria-label="Conversation"
        >
          {conversations === null && <option>Loading…</option>}
          {conversations?.length === 0 && <option value="">No conversations</option>}
          {conversations?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title ?? "(new)"} — {c.agentName}
            </option>
          ))}
        </select>
        {active && (
          <button
            type="button"
            className="provenance-chat-delete-conv"
            onClick={() => onDeleteConversation(active.id)}
            aria-label="Delete conversation"
          >
            ×
          </button>
        )}
      </header>

      {!active && (
        <div className="provenance-chat-empty">
          {agents === null && <p>Loading agents…</p>}
          {agents?.length === 0 && <p>No agents yet. Ask your instructor or add one in My Agents.</p>}
          {agents && agents.length > 0 && (
            <>
              <p>Start a new conversation:</p>
              <ul className="provenance-chat-agent-list">
                {agents.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onStartConversation(a.id)}
                    >
                      {a.name}
                      {a.mine && <span className="provenance-chat-mine">mine</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {active && (
        <>
          <div className="provenance-chat-scroll" ref={scrollerRef}>
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

          <footer className="provenance-chat-input">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Ask the agent… (⌘/Ctrl + Enter)"
              rows={3}
              disabled={!!pendingAsst}
            />
            {pendingAsst ? (
              <button type="button" onClick={onAbort}>Stop</button>
            ) : (
              <button type="button" onClick={onSend} disabled={!draft.trim()}>Send</button>
            )}
          </footer>
        </>
      )}

      {error && <p className="provenance-chat-error">{error}</p>}
    </aside>
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
    <div className={`provenance-bubble-${role}${pending ? " is-pending" : ""}`}>
      <div className="provenance-bubble-body">{content || (pending ? "…" : "")}</div>
      {onInsert && (
        <div className="provenance-bubble-actions">
          <button type="button" onClick={onInsert}>Insert at cursor</button>
        </div>
      )}
    </div>
  );
}
