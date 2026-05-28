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
import { PlusIcon, SignOutIcon } from "../icons.js";
import { relativeTime } from "../time.js";

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
  const navigate = useNavigate();

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        setIsAdmin(Boolean((m as { isAdmin?: boolean }).isAdmin));
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
            {/* v1.0 §1 — Author now sends the user to the picker (which
                redirects to the single-course dashboard when there's only
                one enrollment, no extra click). */}
            <Link to="/courses" className="header-nav-link">
              Author
            </Link>
            {isAdmin && (
              <Link to="/admin" className="header-nav-link">
                Admin
              </Link>
            )}
          </div>
        </header>
        {!notEnrolled && (
          <p className="muted">
            Pick something below to begin. Each one is set up by your
            instructor — it'll tell you up front how it works and what it's
            for.
          </p>
        )}

        {error && <p className="error">{error}</p>}

        {notEnrolled ? (
          <section className="field-group">
            <h2>Welcome — let's get you into your course.</h2>
            <p className="muted">
              This is where your course's AI tools live. Everything here was
              set up by your instructor for a specific purpose, and each tool
              explains itself before you start — no guessing, no surprises.
            </p>
            <p className="muted">
              To join, paste the code your instructor gave you. It usually
              looks something like <code>stats-A4B7C9</code>.
            </p>
            <form className="inline-form" onSubmit={onSubmitJoinCode}>
              <input
                type="text"
                placeholder="Enter your join code"
                value={joinCode}
                disabled={joinBusy}
                autoFocus
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <button type="submit" disabled={joinBusy || !joinCode.trim()}>
                {joinBusy ? "Joining…" : "Join"}
              </button>
            </form>
            <p className="muted small">
              Don't have a code yet? Ask your instructor — they can share one
              or add you directly.
            </p>
            {joinError && <p className="error">{joinError}</p>}
          </section>
        ) : agents === null ? (
          <p className="muted">Loading…</p>
        ) : agents.length === 0 ? (
          <p className="muted">
            Your instructor hasn't set anything up in this course yet. Check
            back soon.
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
