// Landing page. Lists the course's agents; each row launches a new
// conversation, OR resumes an in-progress one, OR shows a completed pill —
// see v0.4 §13 (per-agent Start/Continue/hidden state).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  claimJoinCode,
  getMe,
  listAgents,
  type AgentSummary,
} from "../client.js";
import { logPerf, readBootstrap } from "../bootstrap.js";
import { DEMO_COURSE } from "../course.js";
import { PlusIcon, SignOutIcon } from "../icons.js";
import { relativeTime } from "../time.js";

export function HomePage() {
  // v0.7 §2 — consume the worker-injected bootstrap *synchronously* in the
  // useState initializer so the very first render already has rows; without
  // this we'd flash "Loading…" for one render cycle even when the data is
  // sitting on the page. The useEffect below still refetches when stale.
  const [agents, setAgents] = useState<AgentSummary[] | null>(() => {
    const boot = readBootstrap();
    return boot && boot.courseId === DEMO_COURSE ? boot.agents : null;
  });
  const [error, setError] = useState<string | null>(null);
  // v0.6 §4 — if listAgents 403s with "Not enrolled in this course", the
  // signed-in user isn't enrolled anywhere yet. Surface a join-code form.
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        setIsAdmin(Boolean((m as { isAdmin?: boolean }).isAdmin));
      })
      .catch(() => {
        // /me failing means we're unauthenticated or offline; ignore.
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    // v0.7 §2 — the bootstrap (if any) was already consumed in the
    // useState initializer above; here we just decide whether to refetch.
    // Stale-after-30s rule: when the bootstrap is older than that, refetch
    // immediately so the student sees their actual current state. Within
    // 30 s we trust the bootstrap and skip the fetch entirely.
    const boot = readBootstrap();
    const useCachedBootstrap =
      boot && boot.courseId === DEMO_COURSE &&
      typeof window.__BOOTSTRAP_AT__ === "number" &&
      Date.now() - window.__BOOTSTRAP_AT__ < 30_000;
    if (boot && boot.courseId === DEMO_COURSE) {
      logPerf("agents-from-bootstrap", { count: boot.agents.length });
      if (useCachedBootstrap) return;
    }
    const fetchStart = performance.now();
    listAgents(DEMO_COURSE)
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
  }, []);

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

  return (
    <div className="page hero">
      <div className="card wide">
        <header className="card-header">
          <h1>{import.meta.env.BRAND_PAGE_TITLE}</h1>
          <div className="header-actions">
            {/* Student verbs — the actions a student takes here. */}
            <Link to="/history" className="link-button subtle">
              History
            </Link>
            <button
              type="button"
              className="icon-button"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                // Clear the session cookie + delete the row, then send
                // the user back through Google. Landing on /auth/login
                // (rather than /) means the next view is Google's
                // account chooser — explicit "you are signed out and
                // here is how to sign back in" instead of a blank app
                // page with a hidden re-auth redirect under it.
                // Best-effort: a failed logout still ends in
                // /auth/login, which will overwrite any stale session.
                await fetch("/auth/logout", {
                  method: "POST",
                  credentials: "include",
                }).catch(() => {});
                window.location.href = "/auth/login";
              }}
            >
              <SignOutIcon />
            </button>
            {/* Staff destinations — demoted to muted text links so a
                student's eye doesn't read them as peer actions. v0.7 §3.2. */}
            <span className="header-divider" aria-hidden />
            <Link to="/author/agents" className="header-nav-link">
              Author
            </Link>
            {isAdmin && (
              <Link to="/admin" className="header-nav-link">
                Admin
              </Link>
            )}
          </div>
        </header>
        <p className="muted">
          Pick an agent to begin. The agent leads you through the topics for
          that session — it decides when you're ready to move on.
        </p>

        {error && <p className="error">{error}</p>}

        {notEnrolled ? (
          <section className="field-group">
            <h2>Have a join code?</h2>
            <p className="muted small">
              Your instructor will share a short code. Paste it here to enroll.
            </p>
            <form className="inline-form" onSubmit={onSubmitJoinCode}>
              <input
                type="text"
                placeholder="e.g. stats-A4B7C9"
                value={joinCode}
                disabled={joinBusy}
                autoFocus
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <button type="submit" disabled={joinBusy || !joinCode.trim()}>
                {joinBusy ? "Joining…" : "Join"}
              </button>
            </form>
            {joinError && <p className="error">{joinError}</p>}
          </section>
        ) : agents === null ? (
          <p className="muted">Loading…</p>
        ) : agents.length === 0 ? (
          <p className="muted">
            No agents yet.{" "}
            <Link to="/author/agents/new">Create the first one</Link>.
          </p>
        ) : (
          <ul className="assignment-list">
            {agents.map((a) => {
              // §13 state machine. Backbone completion is "play once": no
              // button, just the pill. Free-chat completion is meaningless
              // (no exit condition), so always show Start.
              const inProgress =
                a.lastConversationId !== null && a.lastCompletedAt === null;
              const completedBackbone =
                a.hasBackbone && a.lastCompletedAt !== null;
              return (
                <li key={a.id}>
                  <div>
                    <strong>{a.title}</strong>
                    <span className="muted small">
                      {" "}
                      · {a.hasBackbone ? "guided" : "free-form"}
                      {a.hasCollection ? " · grounded" : ""}
                    </span>
                  </div>
                  {completedBackbone ? (
                    <span
                      className="history-pill"
                      title={
                        a.lastCompletedAt
                          ? new Date(a.lastCompletedAt).toLocaleString()
                          : undefined
                      }
                    >
                      ✓ Completed{" "}
                      {a.lastCompletedAt
                        ? relativeTime(a.lastCompletedAt)
                        : ""}
                    </span>
                  ) : inProgress ? (
                    <div className="row-actions">
                      {!a.hasBackbone && (
                        // v0.5 §10 + v0.7 §3.1: free-form agents can have
                        // parallel threads. Small circular +icon to the left
                        // of Continue, so the primary affordance (Continue)
                        // keeps the same shape every other row uses.
                        <Link
                          to={`/new/${a.id}`}
                          className="icon-button round"
                          title="Start a new chat with this agent"
                          aria-label="New chat"
                        >
                          <PlusIcon size={16} />
                        </Link>
                      )}
                      <Link
                        to={`/c/${a.lastConversationId}`}
                        className="link-button"
                      >
                        Continue
                      </Link>
                    </div>
                  ) : (
                    // §14: no conversation row is created here — the chat
                    // page enters compose mode and only persists on first send.
                    <Link to={`/new/${a.id}`} className="link-button">
                      Start
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
