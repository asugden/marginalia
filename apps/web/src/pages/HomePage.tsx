// Student home — the agent picker, rendered as the body of StudentLayout's
// outlet at /course/:courseId (the clean course root). The shell owns the
// topbar + chrome; this page renders only the heading lockup, the agent list,
// and the writing entry.
//
// Presentation follows the design-system student kit: an eyebrow→heading
// lockup, and agent rows with zero-padded ordinals, an avatar, kind/grounded
// badges, and a hover accent rail. Course id / name come from useCourse() (the
// shell validated enrollment); the worker-injected bootstrap still seeds the
// first paint with rows when present, avoiding a "Loading…" flash.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listAgents, type AgentSummary } from "../client.js";
import { useCourse } from "../course/useCourse.js";
import { logPerf, readBootstrap } from "../bootstrap.js";
import { ArrowIcon, PencilIcon, PlusIcon } from "../icons.js";
import { relativeTime } from "../time.js";
import { Avatar, Badge, Button, IconButton } from "../components/index.js";

export function HomePage() {
  const { courseId, courseName } = useCourse();
  // v0.7 §2 / v1.0 §7.1 — consume the worker-injected bootstrap *synchronously*
  // in the useState initializer so the very first render already has rows;
  // without this we'd flash "Loading…" for one render cycle even when the data
  // is sitting on the page. The bootstrap only seeds when it's for this course.
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
  const navigate = useNavigate();
  const base = `/course/${courseId}`;

  useEffect(() => {
    // v0.7 §2 — within 30s of the bootstrap, trust it and skip the
    // refetch. Past that, refetch so the student sees current state.
    const fresh =
      initialBoot &&
      typeof window.__BOOTSTRAP_AT__ === "number" &&
      Date.now() - window.__BOOTSTRAP_AT__ < 30_000;
    if (initialBoot) {
      logPerf("agents-from-bootstrap", { count: initialBoot.agents.length });
      if (fresh) return;
    }
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
          // jsonFetch is already bouncing through /auth/login; don't
          // flash the transient error to the user.
        } else {
          setError(message);
        }
      });
  }, [courseId, initialBoot]);

  const inProgressCount =
    agents?.filter((a) => a.lastConversationId !== null && a.lastCompletedAt === null)
      .length ?? 0;
  const doneCount =
    agents?.filter((a) => a.hasBackbone && a.lastCompletedAt !== null).length ?? 0;

  return (
    <div className="app-home__inner">
      <div className="app-head">
        {courseName && <span className="eyebrow">{courseName}</span>}
        <span className="app-rule" />
        <h1>Pick something to begin.</h1>
        <p className="app-head__sub">
          Each one is set up by your instructor — it&rsquo;ll tell you up front
          how it works and what it&rsquo;s for, then lead you through it.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      {agents === null ? (
        <p className="app-empty">Loading…</p>
      ) : agents.length === 0 ? (
        <p className="app-empty">
          Your instructor hasn&rsquo;t set anything up in this course yet. Check
          back soon.
        </p>
      ) : (
        <>
          <div className="app-agents__bar">
            <span className="mono-label">Your agents</span>
            <span className="app-agents__stat">
              {agents.length} total
              <i>·</i> {inProgressCount} in progress
              <i>·</i> {doneCount} done
            </span>
          </div>
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
        </>
      )}

      {/* Writing tool entry point. DS .app-writing zone: set off by a top rule,
          a sunken card with an eyebrow→heading lockup and one primary action. */}
      <section className="app-writing">
        <div className="app-writing__card">
          <div className="app-writing__text">
            <span className="mono-label app-writing__label">Writing</span>
            <h2>Provenance writing space</h2>
            <p className="app-writing__note">
              Write here to share the history and provenance of your work.
            </p>
          </div>
          <div className="app-writing__action">
            <Button href={`${base}/write`} icon={<PencilIcon size={16} />}>
              Open writing &amp; past papers
            </Button>
          </div>
        </div>
      </section>
    </div>
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
        // A round +icon to the left of Continue keeps the primary affordance
        // (Continue) the same shape every other row uses.
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
  // row navigation. The row is a div (not an <a>) so the inner links aren't
  // nested anchors; keyboard users get a focusable role="link".
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
