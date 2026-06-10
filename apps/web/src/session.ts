// Session helpers shared across the app shells (student topbar, staff/admin
// headers). Kept tiny and UI-framework-free so any header can call it.

/**
 * Sign the current user out: clear the session cookie + delete the row on the
 * server, then bounce through /auth/login so the next view is the IdP's account
 * chooser (rather than a stale session silently resuming). Best-effort — a
 * failed logout still lands on /auth/login, which overwrites any stale session.
 */
export async function signOut(): Promise<void> {
  await fetch("/auth/logout", { method: "POST", credentials: "include" }).catch(
    () => {},
  );
  window.location.href = "/auth/login";
}
