// The `/` resolver. Under the course-rooted model nothing lives at `/`
// directly — student surfaces are at /course/:id/learn/*. This page decides
// where a cold load lands:
//
//   * 1 enrollment  → /course/:id/learn (the student home).
//   * 2+ enrollments → /courses (the picker).
//   * 0 enrollments → the join-code prompt (rendered here; a student with no
//     course has nowhere to be sent).
//
// Fast path: the worker may inline a bootstrap payload (window.__BOOTSTRAP__).
// When it's the single-course `agents` shape we redirect *synchronously* off
// the courseId — no /api/me round-trip, no Loading flash — preserving the
// cold-load speed the old eager HomePage had. The agent list itself rides
// along and the student home reads it from the same bootstrap on arrival.

import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { claimJoinCode, getMe } from "../client.js";
import { readBootstrap } from "../bootstrap.js";
import { Button, Field, Input, IconButton, Wordmark } from "../components/index.js";
import { SignOutIcon } from "../icons.js";
import { signOut } from "../session.js";

type Resolution =
  | { kind: "loading" }
  | { kind: "to"; path: string }
  | { kind: "join" };

export function RootRedirect() {
  // Synchronous bootstrap fast-path — decided before first paint.
  const initial = (() => {
    const boot = readBootstrap();
    if (boot?.kind === "agents") {
      return { kind: "to", path: `/course/${boot.courseId}/learn` } as const;
    }
    if (boot?.kind === "picker") {
      return { kind: "to", path: "/courses" } as const;
    }
    return { kind: "loading" } as const;
  })();
  const [res, setRes] = useState<Resolution>(initial);

  useEffect(() => {
    if (res.kind !== "loading") return;
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        if (m.enrollments.length > 1) {
          setRes({ kind: "to", path: "/courses" });
        } else if (m.enrollments.length === 1) {
          setRes({ kind: "to", path: `/course/${m.enrollments[0]!.courseId}/learn` });
        } else {
          setRes({ kind: "join" });
        }
      })
      .catch(() => {
        // /me failing means unauthenticated/offline — jsonFetch handles the
        // sign-in bounce; show the join prompt as a benign fallback.
        if (!ctrl.signal.aborted) setRes({ kind: "join" });
      });
    return () => ctrl.abort();
  }, [res.kind]);

  if (res.kind === "to") return <Navigate to={res.path} replace />;
  if (res.kind === "join") return <JoinPrompt />;
  return <div className="ds-home" />;
}

// The zero-enrollment landing: a student who's signed in but not in any course
// yet. Lifted verbatim from the old HomePage notEnrolled branch.
function JoinPrompt() {
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      await claimJoinCode(code);
      // Route through JoinPage so the success UX matches the /join/:code
      // landing. JoinPage re-claims (idempotent) and shows the welcome state.
      navigate(`/join/${encodeURIComponent(code)}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setJoinBusy(false);
    }
  }

  return (
    <div className="ds-home">
      <header className="ds-topbar">
        <div className="ds-topbar__inner">
          <Wordmark />
          <div className="ds-topbar__actions">
            <IconButton title="Sign out" onClick={signOut}>
              <SignOutIcon />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="ds-home__inner">
        <div className="ds-home__head">
          <span className="ds-rule" />
          <h1>Welcome.</h1>
        </div>
        <section className="ds-home__panel">
          <h2>Let&rsquo;s get you into your course.</h2>
          <p className="ds-home__note">
            This is where your course&rsquo;s AI tools live. Everything here was
            set up by your instructor for a specific purpose, and each tool
            explains itself before you start — no guessing, no surprises.
          </p>
          <p className="ds-home__note">
            To join, paste the code your instructor gave you. It usually looks
            something like <code>stats-A4B7C9</code>.
          </p>
          <form className="ds-home__joinform" onSubmit={onSubmit}>
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
            Don&rsquo;t have a code yet? Ask your instructor — they can share one
            or add you directly.
          </p>
          {joinError && <p className="error">{joinError}</p>}
        </section>
      </div>
    </div>
  );
}
