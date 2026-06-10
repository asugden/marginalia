// The chat view. Loads transcript + (optional) backbone state, sends turns,
// renders the streamed reply token-by-token, and shows backbone progress (as
// an OutlineRail) or free-form note in a collapsible sidebar.
//
// Presentation follows the design-system student kit: a sunken sidebar with the
// agent identity, the outline rail (the visible "state machine"), and recent
// conversations; a conversation column with the Message thread and the
// ChatComposer. All data wiring (streaming, compose-mode promotion, sources,
// abort-on-unmount) is unchanged.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

// The markdown renderer pulls in KaTeX + react-markdown + remark/rehype
// plugins — ~400 kB gzipped that only the chat view ever needs. Lazy-load so
// the landing / author pages stay slim. We *also* eagerly warm the chunk on
// mount (see useEffect below) so the first assistant reply isn't rendered as
// raw markdown text while the chunk is still loading.
const Markdown = lazy(() =>
  import("../Markdown.js").then((m) => ({ default: m.Markdown })),
);
import {
  citationOpenUrl,
  getAgentById,
  getConversation,
  listConversations,
  sendMessage,
  startConversation,
  type BackboneState,
  type ChatMessage,
  type ConversationSummary,
  type MessageSource,
} from "../client.js";
import { clarityNoteFor } from "@marginalia/backbone";
import type { Topic } from "@marginalia/backbone";
import { useCourse } from "../course/useCourse.js";
import { BackIcon, MenuIcon } from "../icons.js";
import { relativeTime } from "../time.js";
import {
  Avatar,
  Badge,
  ChatComposer,
  IconButton,
  Message,
  OutlineRail,
  SourcesStrip,
  ThinkingDots,
} from "../components/index.js";

/** Cap on conversations shown in the in-conversation sidebar (§5). */
const SIDEBAR_CONVERSATION_LIMIT = 10;

export function ConversationPage() {
  // Two routes share this page: /c/:conversationId (a real row) and
  // /new/:agentId (compose mode — no row yet, v0.4 §14). At most one of
  // these is defined at a given mount; we keep track of the effective
  // conversation id in local state because compose mode promotes itself to
  // a real id mid-stream (on the `started` event).
  const params = useParams<{ conversationId?: string; agentId?: string }>();
  const navigate = useNavigate();
  const { courseId } = useCourse();
  const base = `/course/${courseId}`;
  const composeAgentId = params.agentId ?? null;
  const [activeConvId, setActiveConvId] = useState<string | null>(
    params.conversationId ?? null,
  );
  const [searchParams] = useSearchParams();
  // Turn counters are debugging instrumentation for backbone authors; the student
  // view hides them so the conversation reads as tutoring, not a metered quiz (§2).
  const debug = searchParams.get("debug") === "1";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<BackboneState | null>(null);
  const [hasBackbone, setHasBackbone] = useState<boolean>(false);
  // Whether the agent grounds replies in a source collection — shown in the
  // sidebar identity line ("guided · grounded"). Resolved from the agent
  // definition (collectionId) in both the existing-conversation and compose
  // load paths.
  const [grounded, setGrounded] = useState<boolean>(false);
  const [agentTitle, setAgentTitle] = useState<string | null>(null);
  // The full topic list for the OutlineRail. Available directly in compose mode
  // (from the agent definition); for an existing conversation we fetch the
  // agent's definition by id. Empty when the agent has no backbone.
  const [topics, setTopics] = useState<Topic[]>([]);
  // v1.0 — the student-facing clarity line, shown as a quiet, persistent
  // note at the top of the conversation. Resolved server-side for
  // existing rows; computed locally from the agent definition in compose
  // mode (before a row exists).
  const [clarityNote, setClarityNote] = useState<string | null>(null);
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [completion, setCompletion] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 900,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  // Single AbortController for any in-flight stream. Aborted on unmount and
  // before any new send so navigation away or rapid resending doesn't leak
  // a billed LLM stream into the void.
  const streamAbortRef = useRef<AbortController | null>(null);
  // v0.5 §1: When the worker's `started` event promotes us from /new/:agentId
  // to /c/:id, the URL change re-fires the load effect below — which races
  // the worker's persistence of the first user message and can wipe the
  // optimistic user bubble. Stash the just-promoted id here so the load
  // effect can skip its fetch for that one transition. Local state is the
  // source of truth for the in-flight turn.
  const skipLoadForIdRef = useRef<string | null>(null);

  // Warm the lazy Markdown chunk on mount so the first assistant delta
  // doesn't paint as `**raw asterisks**` while the chunk fetches. We don't
  // await — Suspense still falls back if delta arrives before the import
  // resolves, but the race is vastly less likely to lose.
  useEffect(() => {
    void import("../Markdown.js");
  }, []);

  // Load the conversation, OR (in compose mode) the agent definition that
  // seeds the sidebar before any row exists. AbortController guards against
  // a stale fetch resolving after the user switched conversations.
  useEffect(() => {
    const ctrl = new AbortController();
    if (params.conversationId) {
      // v0.5 §1: skip the refetch on the compose→/c/:id URL swap. Local
      // state already has the authoritative view of the turn in flight.
      if (skipLoadForIdRef.current === params.conversationId) {
        skipLoadForIdRef.current = null;
        return () => ctrl.abort();
      }
      getConversation(params.conversationId, ctrl.signal)
        .then((c) => {
          if (ctrl.signal.aborted) return;
          setMessages(c.messages);
          setState(c.state);
          setHasBackbone(c.state !== null);
          setAgentTitle(c.agent?.title ?? null);
          setCurrentTopic(c.currentTopic?.title ?? null);
          setCompletedAt(c.completedAt);
          setClarityNote(c.clarityNote);
          // Fetch the agent definition for the full topic list (so the
          // OutlineRail can render the whole done/current/upcoming sequence —
          // the conversation view only carries the current topic) and the
          // grounded marker. Best-effort; the rail degrades to current-only.
          if (c.agent?.id) {
            getAgentById(c.agent.id)
              .then((a) => {
                if (ctrl.signal.aborted) return;
                setTopics(a.definition.backbone?.topics ?? []);
                setGrounded(!!a.definition.collectionId);
              })
              .catch(() => {
                /* rail falls back to current-topic only */
              });
          }
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          setError(e instanceof Error ? e.message : "Load failed");
        });
    } else if (composeAgentId) {
      // Compose mode (§14): no conversation row yet. Seed the sidebar from
      // the agent definition so the student sees the topic outline before
      // typing the first message.
      getAgentById(composeAgentId)
        .then((a) => {
          if (ctrl.signal.aborted) return;
          setAgentTitle(a.title);
          setClarityNote(clarityNoteFor(a.definition));
          const hasBb = !!a.definition.backbone;
          setHasBackbone(hasBb);
          setGrounded(!!a.definition.collectionId);
          if (hasBb) {
            setTopics(a.definition.backbone!.topics);
            setCurrentTopic(a.definition.backbone!.topics[0]?.title ?? null);
          }
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          setError(e instanceof Error ? e.message : "Load failed");
        });
    }
    return () => ctrl.abort();
  }, [params.conversationId, composeAgentId]);

  // Sidebar conversation history (§5: capped at 10, link to /history for full list).
  // Re-fetch when the active conversation changes or it transitions to completed —
  // those are the events that change the sidebar's top row.
  useEffect(() => {
    const ctrl = new AbortController();
    listConversations(ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setHistory(r.conversations.slice(0, SIDEBAR_CONVERSATION_LIMIT));
      })
      .catch(() => {
        // Sidebar history is non-essential — failure shouldn't block the chat UI.
      });
    return () => ctrl.abort();
  }, [activeConvId, completedAt]);

  // Abort any in-flight stream on unmount. Without this a student who closes
  // the tab mid-reply keeps the Worker isolate billable until Anthropic
  // finishes generating — that's real money at classroom scale.
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  // During streaming, snap-to-bottom uses "auto" instead of "smooth" because
  // a smooth scroll fired on every delta thrashes the browser scheduler and
  // makes scroll-up-to-re-read genuinely difficult. After streaming completes
  // we revert to "smooth" for the final settle.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: streaming ? "auto" : "smooth",
    });
  }, [messages, streaming]);

  async function send(content: string) {
    const text = content.trim();
    if (!text || streaming) return;
    // Need either an existing conversation OR an agent to compose against.
    if (!activeConvId && !composeAgentId) return;

    // Abort any prior in-flight stream (defensive — the streaming gate above
    // should keep this empty, but a partially-failed send may have left one).
    streamAbortRef.current?.abort();
    const ctrl = new AbortController();
    streamAbortRef.current = ctrl;

    setInput("");
    setError(null);
    setStreaming(true);
    // Optimistically append the user bubble. We deliberately do NOT append an
    // empty assistant bubble here — that bubble is added on the first delta
    // so a stream error before any delta leaves the UI clean instead of
    // showing a permanently empty assistant turn.
    setMessages((m) => [...m, { role: "user", content: text }]);
    let assistantOpened = false;

    // Pick the stream source: existing row → sendMessage; compose → the
    // combined start-and-run endpoint, which yields `started` first.
    const stream = activeConvId
      ? sendMessage(activeConvId, text, ctrl.signal)
      : startConversation(composeAgentId!, text, ctrl.signal);

    try {
      for await (const ev of stream) {
        if (ctrl.signal.aborted) break;
        if (ev.type === "started") {
          // §14: swap URL from /new/:agentId to /c/:id without adding a
          // history entry. Update local id so subsequent sends use the
          // /:id/messages route.
          setActiveConvId(ev.conversationId);
          setHasBackbone(ev.state !== null);
          setState(ev.state);
          setCurrentTopic(ev.currentTopic?.title ?? null);
          if (ev.agent?.title) setAgentTitle(ev.agent.title);
          // v0.5 §1: mark this id so the load effect skips its refetch on
          // the URL swap below (would otherwise race the server's user-
          // message persistence and wipe the optimistic bubble).
          skipLoadForIdRef.current = ev.conversationId;
          navigate(`${base}/chat/${ev.conversationId}`, { replace: true });
        } else if (ev.type === "delta") {
          if (!assistantOpened) {
            // First content from the model — now we can safely show the
            // assistant bubble.
            assistantOpened = true;
            setMessages((m) => [
              ...m,
              { role: "assistant", content: ev.text },
            ]);
          } else {
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1]!;
              next[next.length - 1] = {
                ...last,
                content: last.content + ev.text,
              };
              return next;
            });
          }
        } else if (ev.type === "sources") {
          // v0.5 §3 — attach citations to the assistant bubble before `done`
          // flips raw `[^src_*]` tokens to pills. If the model produced
          // nothing (no assistant bubble was opened), we silently drop them.
          const items = ev.items;
          setMessages((m) => {
            if (m.length === 0) return m;
            const last = m[m.length - 1]!;
            if (last.role !== "assistant") return m;
            const next = m.slice();
            next[next.length - 1] = { ...last, sources: items };
            return next;
          });
        } else if (ev.type === "done") {
          setState(ev.state);
          setCurrentTopic(ev.currentTopic?.title ?? null);
          if (ev.completionMessage) setCompletion(ev.completionMessage);
          // Trust the server stamp — wall-clock skew between client and
          // server would otherwise show a confusing "Completed on …" date.
          if (ev.completedAt !== null) {
            setCompletedAt(ev.completedAt);
          }
          // v0.5 §5: when a free-chat row still has no title, the server's
          // listConversations waitUntil is about to (or just did) generate
          // one. Schedule a single delayed refetch so the sidebar picks it
          // up without a polling loop. Backbone rows derive their title, no
          // generation step, no need to refetch.
          if (!hasBackbone && ev.conversationTitle === null) {
            setTimeout(() => {
              listConversations()
                .then((r) =>
                  setHistory(
                    r.conversations.slice(0, SIDEBAR_CONVERSATION_LIMIT),
                  ),
                )
                .catch(() => {
                  // Sidebar refresh is non-essential — quietly skip.
                });
            }, 2000);
          }
        } else if (ev.type === "error") {
          setError(ev.message);
          // No assistant bubble was added (we wait for first delta), so
          // there's nothing to roll back. If the stream errored mid-way
          // through deltas, the partial assistant content stays visible
          // as-is — that's the honest representation of what arrived.
        }
      }
    } catch (e) {
      // AbortError on unmount / new send is expected; swallow quietly.
      if ((e as Error)?.name === "AbortError") return;
      // If no assistant bubble was ever opened, the user sees only their
      // own message plus the error banner — clean, retryable.
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      if (streamAbortRef.current === ctrl) streamAbortRef.current = null;
      setStreaming(false);
    }
  }

  const finished = (state?.finished ?? false) || completedAt !== null;
  const currentIndex = state?.currentTopicIndex ?? 0;

  // Build the OutlineRail steps from the topic list + current index. Done for
  // earlier topics, current for the active one (or "Complete" when finished),
  // upcoming for the rest. Falls back to a single current-topic step when the
  // full list isn't loaded.
  const railSteps =
    topics.length > 0
      ? topics.map((t, i) => ({
          title: t.title,
          status: finished
            ? ("done" as const)
            : i < currentIndex
              ? ("done" as const)
              : i === currentIndex
                ? ("current" as const)
                : ("upcoming" as const),
        }))
      : currentTopic
        ? [{ title: currentTopic, status: "current" as const }]
        : [];

  const agentLabel = agentTitle ?? "Agent";

  return (
    <div className={"app-chat no-watermark" + (sidebarOpen ? "" : " app-chat--collapsed")}>
      <aside className="app-side" aria-hidden={!sidebarOpen}>
        <div className="app-side__inner">
          <div className="app-side__agent">
            <Avatar name={agentLabel} agent={hasBackbone} />
            <div>
              <div className="app-side__name">{agentLabel}</div>
              <div className="app-side__kind">
                {hasBackbone ? "guided" : "free-form"}
                {grounded ? " · grounded" : ""}
              </div>
            </div>
          </div>

          {hasBackbone ? (
            <div className="app-side__block">
              <div className="mono-label">Outline</div>
              {railSteps.length > 0 ? (
                <OutlineRail steps={railSteps} />
              ) : (
                <p className="app-side__free">Loading…</p>
              )}
              {debug && state && (
                <p className="app-side__free">
                  Turns on topic: {state.turnsOnTopic} · total: {state.totalTurns}
                </p>
              )}
            </div>
          ) : (
            <div className="app-side__block">
              <p className="app-side__free">
                Free-form chat — no topic sequence for this agent.
              </p>
            </div>
          )}

          {history.length > 0 && (
            <div className="app-side__block">
              <div className="mono-label">Conversations</div>
              <ul className="app-side__history">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className={h.id === activeConvId ? "is-active" : ""}
                  >
                    <Link to={`${base}/chat/${h.id}`}>
                      <span>{h.title || "Untitled"}</span>
                      <small>{relativeTime(h.updatedAt)}</small>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to={`${base}/history`} className="ds-side__seeall">
                See all →
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Backdrop for mobile sidebar — tap to dismiss. */}
      <div
        className="app-side__scrim"
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <main className="app-conv">
        <header className="app-conv__head">
          <IconButton title="Back to home" href={base}>
            <BackIcon size={20} />
          </IconButton>
          <IconButton
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
          >
            <MenuIcon size={20} />
          </IconButton>
          <span className="app-conv__title">{agentTitle}</span>
          {hasBackbone && topics.length > 0 && (
            <Badge tone="neutral">
              {finished
                ? "Complete"
                : `Topic ${Math.min(currentIndex + 1, topics.length)} of ${topics.length}`}
            </Badge>
          )}
        </header>

        {/* v1.0 — persistent, quiet clarity note. Always present (never
            dismissible) because its job is trust: the student should be
            able to glance up and see what this is and how it behaves. */}
        {clarityNote && (
          <div className="ds-clarity" role="note">
            {clarityNote}
          </div>
        )}

        <div className="app-conv__scroll">
          <div className="app-conv__thread">
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              const showDots =
                m.role === "assistant" && streaming && isLast && !m.content;
              const sources = m.sources;
              return (
                <Message
                  key={i}
                  role={m.role}
                  roleLabel={m.role === "assistant" ? agentLabel : undefined}
                >
                  {m.role === "assistant" ? (
                    showDots ? (
                      <ThinkingDots />
                    ) : (
                      <>
                        <Suspense
                          fallback={
                            <span className="md-loading">{m.content}</span>
                          }
                        >
                          <Markdown
                            citations={sources}
                            citationHref={(c) => citationOpenUrl(c, courseId)}
                          >
                            {m.content}
                          </Markdown>
                        </Suspense>
                        {sources && sources.length > 0 && (
                          <SourcesStrip
                            sources={sources.map((s) => ({
                              ordinal: s.ordinal,
                              filename: s.filename,
                              href: citationOpenUrl(s, courseId) ?? undefined,
                            }))}
                          />
                        )}
                      </>
                    )
                  ) : (
                    m.content
                  )}
                </Message>
              );
            })}
            {completion && <Message role="system">{completion}</Message>}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        {completedAt !== null ? (
          <div className="ds-completed" role="status">
            Completed on{" "}
            {new Date(completedAt).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            . Start a <Link to={base}>new chat</Link> to continue.
          </div>
        ) : (
          <div className="app-conv__composer">
            <ChatComposer
              value={input}
              onChange={setInput}
              onSend={send}
              disabled={streaming || finished}
              placeholder={
                finished
                  ? "Conversation complete"
                  : "Message " + agentLabel + "…"
              }
              footer={
                <span>
                  {hasBackbone
                    ? "Following the agent’s outline"
                    : "Free-form room"}
                </span>
              }
            />
          </div>
        )}
      </main>
    </div>
  );
}
