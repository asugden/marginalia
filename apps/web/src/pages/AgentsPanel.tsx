// The Agents module surface — the always-present core of a course. Extracted
// from the old HomePage so it can render in two places that read as peers:
//   * the Dashboard (stacked with the Writing panel), and
//   * the dedicated Agents route (/course/:id/agents), full-bleed.
// It's self-contained: given the course id it seeds from the worker-injected
// bootstrap on first paint, then fetches the live agent list. Rows start or
// continue a conversation exactly as before.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listAgents, type AgentSummary } from "../client.js";
import { logPerf, readBootstrap } from "../bootstrap.js";
import { ArrowIcon, PlusIcon } from "../icons.js";
import { relativeTime } from "../time.js";
import { Avatar, Badge, Button, IconButton } from "../components/index.js";

export function AgentsPanel({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const base = `/course/${courseId}`;

  // Consume the worker-injected bootstrap *synchronously* in the initializer so
  // the very first render already has rows (preserves cold-load speed).
  const initialBoot = (() => {
    const boot = readBootstrap();
    return boot && boot.kind === "agents" && boot.courseId === courseId
      ? boot
      : null;
  })();
  const [agents, setAgents] = useState<AgentSummary[] | null>(
    initialBoot?.agents ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fresh =
      initialBoot &&
      typeof window.__BOOTSTRAP_AT__ === "number" &&
      Date.now() - window.__BOOTSTRAP_AT__ < 30_000;
    if (initialBoot) {
      logPerf("agents-from-bootstrap", { count: initialBoot.agents.length });
    }
    if (initialBoot && fresh) return;
    const fetchStart = performance.now();
    listAgents(courseId)
      .then((r) => {
        setAgents(r.agents);
        logPerf("agents-from-network", {
          count: r.agents.length,
          ms: Math.round(performance.now() - fetchStart),
        });
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : "Load failed";
        if (/redirecting to sign-in/i.test(message)) {
          // jsonFetch is already bouncing through /auth/login; don't flash.
        } else {
          setError(message);
        }
      });
  }, [courseId, initialBoot]);

  const inProgress =
    agents?.filter((a) => a.lastConversationId !== null && a.lastCompletedAt === null)
      .length ?? 0;
  const done =
    agents?.filter((a) => a.hasBackbone && a.lastCompletedAt !== null).length ?? 0;

  return (
    <section className="app-modpanel app-modpanel--open" data-module="agents">
      <div className="app-modpanel__head">
        <div className="app-modpanel__heading">
          <span className="eyebrow">Tutors to talk to</span>
          <h2>Agents</h2>
        </div>
        {agents && agents.length > 0 && (
          <span className="app-modpanel__meta">
            {agents.length} total &middot; {inProgress} in progress &middot;{" "}
            {done} done
          </span>
        )}
      </div>
      <div className="app-modpanel__body">
        {error && <p className="error">{error}</p>}
        {agents === null ? (
          <p className="app-empty">Loading…</p>
        ) : agents.length === 0 ? (
          <p className="app-empty">
            Your instructor hasn&rsquo;t set anything up in this course yet.
            Check back soon.
          </p>
        ) : (
          <div className="app-agents">
            {agents.map((a, i) => (
              <AgentRow
                key={a.id}
                agent={a}
                n={i + 1}
                base={base}
                navigate={navigate}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AgentRow({
  agent: a,
  n,
  base,
  navigate,
}: {
  agent: AgentSummary;
  n: number;
  base: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  // §13 state machine. Backbone completion is "play once": no button, just the
  // pill. Free-chat completion is meaningless (no exit condition), so always
  // show Start.
  const inProgress = a.lastConversationId !== null && a.lastCompletedAt === null;
  const completedBackbone = a.hasBackbone && a.lastCompletedAt !== null;
  const continueHref = `${base}/chat/${a.lastConversationId}`;
  const startHref = `${base}/chat/new/${a.id}`;
  const target = inProgress ? continueHref : startHref;

  const action = completedBackbone ? (
    <Badge
      tone="success"
      dot
      title={
        a.lastCompletedAt
          ? new Date(a.lastCompletedAt).toLocaleString()
          : undefined
      }
    >
      Completed {a.lastCompletedAt ? relativeTime(a.lastCompletedAt) : ""}
    </Badge>
  ) : inProgress ? (
    <>
      {!a.hasBackbone && (
        // v0.5 §10 + v0.7 §3.1: free-form agents can have parallel threads.
        <IconButton
          variant="round"
          href={startHref}
          title="Start a new chat with this agent"
        >
          <PlusIcon size={16} />
        </IconButton>
      )}
      <Button
        variant="primary"
        href={continueHref}
        className="app-agent__cta"
        iconRight={<ArrowIcon size={16} />}
      >
        Continue
      </Button>
    </>
  ) : (
    // §14: no conversation row is created here — the chat page enters compose
    // mode and only persists on first send.
    <Button
      variant="primary"
      href={startHref}
      className="app-agent__cta"
      iconRight={<ArrowIcon size={16} />}
    >
      Start
    </Button>
  );

  // The whole row is clickable (→ the row's default action), but the action
  // column holds its own real links, so a click there must not also fire the
  // row navigation.
  return (
    <div
      className="app-agent"
      role="link"
      tabIndex={0}
      onClick={() => navigate(target)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(target);
      }}
    >
      <span className="app-agent__index">{String(n).padStart(2, "0")}</span>
      <Avatar name={a.title} agent={a.hasBackbone} size="lg" />
      <div className="app-agent__main">
        <div className="app-agent__title">{a.title}</div>
        <div className="app-agent__meta">
          <Badge tone={a.hasBackbone ? "brand" : "ghost"}>
            {a.hasBackbone ? "guided" : "free-form"}
          </Badge>
          {a.hasCollection && (
            <Badge tone="info" dot>
              grounded
            </Badge>
          )}
        </div>
      </div>
      <div className="app-agent__action" onClick={(e) => e.stopPropagation()}>
        {action}
      </div>
    </div>
  );
}
