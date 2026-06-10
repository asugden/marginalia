// /join/:code — student self-enrollment landing page (v0.6 §4).
//
// Two render states:
//   1. Loading: POST /api/join/:code, await reply.
//   2. Resolved: show "Welcome to <course>" with a Continue button, or an
//      error explaining why the code was refused.
//
// If the user isn't signed in, the API returns 401 and the worker's
// authenticate() rejected us; in that case the SPA falls back to the login
// flow with a return_to of the current URL — we wire that in below.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { claimJoinCode } from "../client.js";
import { Button, Wordmark } from "../components/index.js";
import { ArrowIcon } from "../icons.js";

type State =
  | { kind: "loading" }
  | { kind: "ok"; courseId: string; alreadyEnrolled: boolean }
  | { kind: "error"; message: string; needsSignIn: boolean };

export function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!code) {
      setState({ kind: "error", message: "Missing code", needsSignIn: false });
      return;
    }
    const ctrl = new AbortController();
    claimJoinCode(code)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setState({
          kind: "ok",
          courseId: r.courseId,
          alreadyEnrolled: r.alreadyEnrolled,
        });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Could not claim code";
        // The worker returns 401 (caught here as a thrown error) when the
        // caller isn't signed in. Detect that and offer a sign-in link.
        const needsSignIn = /unauthorized/i.test(message);
        setState({ kind: "error", message, needsSignIn });
      });
    return () => ctrl.abort();
  }, [code]);

  return (
    <div className="ds-join">
      <header className="app-topbar">
        <div className="app-topbar__inner">
          <Wordmark />
        </div>
      </header>
      <div className="ds-join__inner">
        <div className="ds-home__panel ds-join__card">
          {state.kind === "loading" ? (
            <>
              <span className="eyebrow">Joining</span>
              <span className="ds-rule" />
              <p className="app-writing__note">Joining…</p>
            </>
          ) : state.kind === "error" ? (
            <>
              <span className="eyebrow">Join a course</span>
              <span className="ds-rule" />
              <h2>Couldn&rsquo;t join</h2>
              <p className="error">{state.message}</p>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                {state.needsSignIn && (
                  <Button
                    variant="primary"
                    href={`/auth/login?return_to=${encodeURIComponent(`/join/${code}`)}`}
                  >
                    Sign in and try again
                  </Button>
                )}
                <Button variant="subtle" href="/">
                  ← Back home
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="eyebrow">
                {state.alreadyEnrolled ? "Already enrolled" : "Welcome"}
              </span>
              <span className="ds-rule" />
              <h2>{state.alreadyEnrolled ? "You're already in." : "You're in!"}</h2>
              <p className="app-writing__note">
                {state.alreadyEnrolled
                  ? "You were already enrolled in this course."
                  : "You've been enrolled. Head in to pick something to begin."}
              </p>
              <div>
                <Button
                  variant="primary"
                  iconRight={<ArrowIcon size={16} />}
                  onClick={() => navigate("/")}
                >
                  Continue
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
