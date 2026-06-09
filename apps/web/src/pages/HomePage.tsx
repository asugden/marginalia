// Landing page. Lists the course's agents; each row launches a new
// conversation, OR resumes an in-progress one, OR shows a completed pill —
// see v0.4 §13 (per-agent Start/Continue/hidden state).
//
// Presentation follows the design-system student kit: a translucent sticky
// header with the wordmark lockup, an eyebrow→heading lockup, and agent rows
// with zero-padded ordinals, an avatar, kind/grounded badges, and a hover
// accent rail. The data wiring (bootstrap, /me, listAgents, join-code claim)
// is unchanged.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  claimJoinCode,
  getMe,
  listAgents,
  type AgentSummary,
} from "../client.js";
import { logPerf, readBootstrap } from "../bootstrap.js";
import { ArrowIcon, HistoryIcon, PlusIcon, SignOutIcon, UserIcon } from "../icons.js";
import { relativeTime } from "../time.js";
import { Avatar, Badge, Button, Field, IconButton, Input, Wordmark } from "../components/index.js";

export function HomePage() {
  // v0.7 §2 / v1.0 §7.1 — consume the worker-injected bootstrap *synchronously*
  // in the useState initializer so the very first render already has rows;
  // without this we'd flash "Loading…" for one render cycle even when the data
  // is sitting on the page. The bootstrap also carries the courseId (the user's
  // single enrollment), which we trust for the initial render and the refetch
  // path; /api/me below is the source of truth when there is no bootstrap.
  const initialBoot = (() => {
    const boot = readBootstrap();
    return boot && boot.kind === "agents" ? boot : null;
  })();
  const [agents, setAgents] = useState<AgentSummary[] | null>(
    initialBoot?.agents ?? null,
  );
  const [courseId, setCourseId] = useState<string | null>(
    initialBoot?.courseId ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  // v0.6 §4 — if listAgents 403s with "Not enrolled in this course", the
  // signed-in user isn't enrolled anywhere yet. Surface a join-code form.
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // The identity chip and eyebrow read from /me — email local-part + course
  // name. Both are real fields; we never fabricate a display name.
  const [identity, setIdentity] = useState<string | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        setIsAdmin(Boolean((m as { isAdmin?: boolean }).isAdmin));
        if (m.email) setIdentity(m.email.split("@")[0] ?? null);
        // v1.0 §2 — when the user has more than one enrollment, send them
        // to the picker. Single-enrollment users (the ~99% case) stay
        // here and see exactly today's UX.
        if (m.enrollments.length > 1) {
          navigate("/courses", { replace: true });
          return;
        }
        if (m.enrollments.length === 1) {
          // v1.0 §7.1 — discover the single-enrollment courseId from /me
          // (the worker uses this user's enrollments to authorize the
          // listAgents call below). The bootstrap may already have set
          // this; /me confirms or fills in when the bootstrap is absent.
          setCourseId((current) => current ?? m.enrollments[0]!.courseId);
          setCourseName(m.enrollments[0]!.courseName ?? null);
        } else {
          setNotEnrolled(true);
        }
      })
      .catch(() => {
        // /me failing means we're unauthenticated or offline; ignore.
      });
    return () => ctrl.abort();
  }, [navigate]);

  useEffect(() => {
    if (!courseId) return;
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
        if (/not enrolled/i.test(message)) {
          setNotEnrolled(true);
        } else if (/redirecting to sign-in/i.test(message)) {
          // jsonFetch is already bouncing through /auth/login; don't
          // flash the transient error to the user.
        } else {
          setError(message);
        }
      });
  }, [courseId, initialBoot]);

  async function onSubmitJoinCode(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      await claimJoinCode(code);
      // Route through the JoinPage so the success UX is consistent with
      // the link-flavoured /join/:code landing. JoinPage will re-claim
      // (idempotent) and show the welcome state.
      navigate(`/join/${encodeURIComponent(code)}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setJoinBusy(false);
    }
  }

  async function onSignOut() {
    // Clear the session cookie + delete the row, then send the user back
    // through Google. Landing on /auth/login (rather than /) means the next
    // view is Google's account chooser. Best-effort: a failed logout still
    // ends in /auth/login, which overwrites any stale session.
    await fetch("/auth/logout", { method: "POST", credentials: "include" }).catch(
      () => {},
    );
    window.location.href = "/auth/login";
  }

  const inProgressCount =
    agents?.filter((a) => a.lastConversationId !== null && a.lastCompletedAt === null)
      .length ?? 0;
  const doneCount =
    agents?.filter((a) => a.hasBackbone && a.lastCompletedAt !== null).length ?? 0;

  return (
    <div className="ds-home">
      <header className="ds-topbar">
        <div className="ds-topbar__inner">
          <Wordmark />
          <div className="ds-topbar__actions">
            {/* Student verbs — the actions a student takes here. */}
            <Button
              variant="ghost"
              size="sm"
              icon={<HistoryIcon size={16} />}
              href="/history"
            >
              <span className="ds-hide-sm">History</span>
            </Button>
            <span className="ds-topbar__divider" aria-hidden />
            {/* Staff destinations — muted mono links so a student's eye doesn't
                read them as peer actions. v1.0 §1 — Instructor sends to the
                picker (redirects to the single-course dashboard when there's
                only one enrollment). */}
            <Link to="/courses" className="ds-navlink">
              Instructor
            </Link>
            {isAdmin && (
              <Link to="/admin" className="ds-navlink">
                Admin
              </Link>
            )}
            <span className="ds-topbar__divider" aria-hidden />
            {identity && (
              <span className="ds-id">
                <span className="ds-id__icon">
                  <UserIcon />
                </span>
                <span className="ds-id__name">{identity}</span>
              </span>
            )}
            <IconButton title="Sign out" onClick={onSignOut}>
              <SignOutIcon />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="ds-home__inner">
        <div className="ds-home__head">
          {courseName && <span className="eyebrow">{courseName}</span>}
          <span className="ds-rule" />
          <h1>{notEnrolled ? "Welcome." : "Pick something to begin."}</h1>
          {!notEnrolled && (
            <p className="ds-home__sub">
              Each one is set up by your instructor — it&rsquo;ll tell you up
              front how it works and what it&rsquo;s for, then lead you through
              it.
            </p>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        {notEnrolled ? (
          <section className="ds-home__panel">
            <h2>Let&rsquo;s get you into your course.</h2>
            <p className="ds-home__note">
              This is where your course&rsquo;s AI tools live. Everything here
              was set up by your instructor for a specific purpose, and each
              tool explains itself before you start — no guessing, no surprises.
            </p>
            <p className="ds-home__note">
              To join, paste the code your instructor gave you. It usually looks
              something like <code>stats-A4B7C9</code>.
            </p>
            <form className="ds-home__joinform" onSubmit={onSubmitJoinCode}>
              <Field label="Join code">
                <Input
                  type="text"
                  placeholder="Enter your join code"
                  value={joinCode}
                  disabled={joinBusy}
                  autoFocus
                  onChange={(e) => setJoinCode(e.target.value)}
                />
              </Field>
              <Button
                type="submit"
                loading={joinBusy}
                disabled={joinBusy || !joinCode.trim()}
              >
                {joinBusy ? "Joining…" : "Join"}
              </Button>
            </form>
            <p className="ds-home__muted">
              Don&rsquo;t have a code yet? Ask your instructor — they can share
              one or add you directly.
            </p>
            {joinError && <p className="error">{joinError}</p>}
          </section>
        ) : agents === null ? (
          <p className="ds-home__muted">Loading…</p>
        ) : agents.length === 0 ? (
          <p className="ds-home__muted">
            Your instructor hasn&rsquo;t set anything up in this course yet.
            Check back soon.
          </p>
        ) : (
          <>
            <div className="ds-agents__bar">
              <span className="mono-label">Your agents</span>
              <span className="ds-agents__stat">
                {agents.length} total
                <i>·</i> {inProgressCount} in progress
                <i>·</i> {doneCount} done
              </span>
            </div>
            <div className="ds-agents">
              {agents.map((a, i) => (
                <AgentRow key={a.id} agent={a} n={i + 1} navigate={navigate} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AgentRow({
  agent: a,
  n,
  navigate,
}: {
  agent: AgentSummary;
  n: number;
  navigate: ReturnType<typeof useNavigate>;
}) {
  // §13 state machine. Backbone completion is "play once": no button, just the
  // pill. Free-chat completion is meaningless (no exit condition), so always
  // show Start.
  const inProgress = a.lastConversationId !== null && a.lastCompletedAt === null;
  const completedBackbone = a.hasBackbone && a.lastCompletedAt !== null;
  const continueHref = `/c/${a.lastConversationId}`;
  const startHref = `/new/${a.id}`;
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
        className="ds-agent__cta"
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
      className="ds-agent__cta"
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
      className="ds-agent"
      role="link"
      tabIndex={0}
      onClick={() => navigate(target)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(target);
      }}
    >
      <span className="ds-agent__index">{String(n).padStart(2, "0")}</span>
      <Avatar name={a.title} agent={a.hasBackbone} size="lg" />
      <div className="ds-agent__main">
        <div className="ds-agent__title">{a.title}</div>
        <div className="ds-agent__meta">
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
      <div
        className="ds-agent__action"
        onClick={(e) => e.stopPropagation()}
      >
        {action}
      </div>
    </div>
  );
}
