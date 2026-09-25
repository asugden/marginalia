// The catch-all 404. Mounted twice in main.tsx: as the trailing `path: "*"`
// route (nothing matched the URL) and as the router's `errorElement` (a route
// matched but threw, including the lazy-chunk failures Suspense can't catch).
// Before this, both cases fell through to React Router's built-in error screen,
// which renders unstyled developer copy at anyone who mistypes a URL.
//
// Course-agnostic by necessity — an unmatched path may carry no course id, or a
// bogus one — so it borrows the student register's standalone shell from
// JoinPage: bare Wordmark topbar over a centred card, no course chrome to
// resolve. See docs/style.md §1.
//
// The one thing it has to get right is where "back" points. That depends on
// whether the visitor is signed in, which we can only learn from /api/me — and
// asking costs a round trip we don't want to block the message on. So the copy
// renders immediately and the button resolves underneath it (see below).

import { useEffect, useState } from "react";
import { Link, useRouteError } from "react-router-dom";
import { getMe } from "../client.js";
import { Button, Wordmark } from "../components/index.js";
import { ArrowIcon } from "../icons.js";

/** Where "back" sends this visitor, once we know who they are. */
type Destination =
  // Still asking /api/me. The button renders in this state, pointing at "/",
  // which is correct for BOTH outcomes — RootRedirect resolves a signed-in
  // caller to their course and jsonFetch bounces a signed-out one to the IdP.
  // Resolving only sharpens the label; it never rescues a wrong link, so
  // there's no reason to make the visitor wait on it.
  | { kind: "pending" }
  | { kind: "app" }
  | { kind: "signIn" };

export function NotFoundPage() {
  const [dest, setDest] = useState<Destination>({ kind: "pending" });
  // Present when this renders as the errorElement rather than the `*` route.
  const error = useRouteError();

  useEffect(() => {
    const ctrl = new AbortController();
    // noAuthRedirect: a signed-out visitor on a bad URL must SEE the 404, not
    // get thrown at Google by the page that's explaining the mistake. This is
    // the JoinPage rule (see JsonFetchOpts) — a page that renders its own
    // sign-in affordance owns the 401 rather than letting jsonFetch bounce it.
    getMe(ctrl.signal, { noAuthRedirect: true })
      .then(() => {
        if (!ctrl.signal.aborted) setDest({ kind: "app" });
      })
      .catch(() => {
        // Unauthorized — or offline, or /api unreachable. All three land on the
        // same button: sign-in is the only move a signed-out visitor has, and
        // for a transient failure it costs one redirect that resolves itself.
        if (!ctrl.signal.aborted) setDest({ kind: "signIn" });
      });
    return () => ctrl.abort();
  }, []);

  // Don't echo the path back — it's attacker-controlled text, and a visitor who
  // mistyped /course already knows what they typed.
  return (
    <div className="ds-join">
      <header className="app-topbar">
        <div className="app-topbar__inner">
          <Link to="/" aria-label="Home" className="app-lockup-link">
            <Wordmark />
          </Link>
        </div>
      </header>
      <div className="ds-join__inner">
        <div className="ds-home__panel ds-join__card">
          <span className="eyebrow">{error ? "Something broke" : "404"}</span>
          <span className="ds-rule" />
          <h2>{error ? "That page didn't load." : "That page doesn't exist."}</h2>
          <p className="ds-home__note">
            {error
              ? "Something went wrong loading this page. Reloading often fixes it — otherwise head back and try again."
              : "The link may be mistyped or out of date. Check the address, or head back and pick up where you left off."}
          </p>
          <div>
            {dest.kind === "signIn" ? (
              <Button
                variant="primary"
                href={`/auth/login?return_to=${encodeURIComponent("/")}`}
              >
                Sign in
              </Button>
            ) : (
              <Button
                variant="primary"
                href="/"
                iconRight={<ArrowIcon size={16} />}
              >
                {dest.kind === "app" ? "Back to your courses" : "Back home"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
