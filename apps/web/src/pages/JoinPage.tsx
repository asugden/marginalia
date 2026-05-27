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
import { Link, useNavigate, useParams } from "react-router-dom";
import { claimJoinCode } from "../client.js";

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

  if (state.kind === "loading") {
    return (
      <div className="page">
        <div className="card">
          <p>Joining…</p>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="page">
        <div className="card">
          <h1>Couldn't join</h1>
          <p className="error">{state.message}</p>
          {state.needsSignIn && (
            <p>
              <a
                href={`/auth/login?return_to=${encodeURIComponent(`/join/${code}`)}`}
                className="link-button"
              >
                Sign in and try again
              </a>
            </p>
          )}
          <p>
            <Link to="/">← Back home</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <h1>{state.alreadyEnrolled ? "Already enrolled" : "Welcome!"}</h1>
        <p>
          {state.alreadyEnrolled
            ? "You were already in this course."
            : "You've been enrolled."}
        </p>
        <p>
          <button type="button" onClick={() => navigate("/")}>Continue</button>
        </p>
      </div>
    </div>
  );
}
