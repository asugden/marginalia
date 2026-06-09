// Student-facing check-in page. The QR resolves to /a/:id?t=<token>; this
// component reads the token from the URL, asks for geolocation, and posts
// to the server. The big checkbox is the only thing the student interacts
// with on the happy path.
//
// Visual register: student. Brand-tinted page background (.hero) with the
// optional watermark, a single white card, brand-red primary action — same
// shape as HomePage/JoinPage so the student lands on something that already
// feels like the rest of the app.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  deviceFingerprintString,
  getCheckInfo,
  submitCheckin,
  type CheckInfo,
  type CheckinFlag,
} from "../api.js";

type Stage =
  | { kind: "loading" }
  | { kind: "needs-signin" }
  | { kind: "ready"; info: CheckInfo }
  | { kind: "submitting" }
  | { kind: "done"; flags: CheckinFlag[] }
  | { kind: "error"; message: string };

// Friendly, trust-framed copy shown under the badges. Not an accusation —
// just a note so the student knows what their instructor might see.
const FLAG_BLURB: Record<CheckinFlag, string> = {
  outside_radius: "We couldn't tell you were inside the room — your instructor can sort it out with you.",
  no_geofence: "",  // not informative for the student
  no_location: "You didn't share your location — that's completely fine, we just noted it.",
  duplicate_device: "This device already checked someone in today — your instructor may follow up.",
  duplicate_cookie: "This device already checked someone in today — your instructor may follow up.",
  late: "",
};

// Each flag maps to a small pill badge. `null` means "don't surface it."
type BadgeTone = "success" | "info" | "warning";
const FLAG_BADGE: Record<CheckinFlag, { label: string; tone: BadgeTone } | null> = {
  no_location: { label: "No location", tone: "info" },
  outside_radius: { label: "Outside room", tone: "warning" },
  duplicate_device: { label: "Shared device", tone: "warning" },
  duplicate_cookie: { label: "Shared device", tone: "warning" },
  late: { label: "Late", tone: "info" },
  no_geofence: null,
};

export function CheckInPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const token = search.get("t") ?? "";
  const [stage, setStage] = useState<Stage>({ kind: "loading" });

  // Load session info. If the server says 401, we need to send the user
  // through OAuth and come back — the QR target is preserved.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await getCheckInfo(id);
        if (!cancelled) {
          if (!info.open) {
            setStage({ kind: "error", message: "This session is closed." });
          } else {
            setStage({ kind: "ready", info });
          }
        }
      } catch (e) {
        if (cancelled) return;
        const msg = String((e as Error).message);
        if (msg.startsWith("401")) setStage({ kind: "needs-signin" });
        else setStage({ kind: "error", message: msg });
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const signInUrl = useMemo(() => {
    const here = window.location.pathname + window.location.search;
    return `/auth/login?return_to=${encodeURIComponent(here)}`;
  }, []);

  const submit = useCallback(async () => {
    if (!id || !token) return;
    setStage({ kind: "submitting" });
    const geo = await readGeolocation();
    try {
      const result = await submitCheckin(id, {
        token,
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
        accuracyM: geo?.accuracy ?? null,
        fingerprint: deviceFingerprintString(),
      });
      setStage({ kind: "done", flags: result.flags });
    } catch (e) {
      setStage({ kind: "error", message: String((e as Error).message) });
    }
  }, [id, token]);

  return (
    <div className="page hero">
      <div className="card attendance-card">
        {stage.kind === "loading" && <p className="muted">Loading…</p>}

        {stage.kind === "needs-signin" && (
          <>
            <h1>Check in</h1>
            <p className="muted">
              Sign in with your school account to confirm you're in class.
            </p>
            <a className="link-button block" href={signInUrl}>Sign in</a>
          </>
        )}

        {stage.kind === "error" && <p className="error">{stage.message}</p>}

        {stage.kind === "submitting" && (
          <p className="muted">Checking you in…</p>
        )}

        {stage.kind === "done" && <CheckedIn flags={stage.flags} />}

        {stage.kind === "ready" && (
          <>
            <div className="attendance-date muted small">{stage.info.sessionDate}</div>
            <h1>{stage.info.courseTitle || "Attendance"}</h1>
            {stage.info.label && <p className="muted">{stage.info.label}</p>}
            <button
              type="button"
              className="attendance-primary"
              onClick={submit}
              disabled={!token}
            >
              I'm present
            </button>
            {!token && (
              <p className="error small">
                This page is missing a check-in code. Re-scan the QR.
              </p>
            )}
            <p className="muted small attendance-fineprint">
              We'll briefly ask for your location — checking in works either way.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function CheckedIn({ flags }: { flags: CheckinFlag[] }) {
  const badges = flags
    .map((f) => FLAG_BADGE[f])
    .filter((b): b is { label: string; tone: BadgeTone } => b !== null);
  const blurbs = flags.filter((f) => FLAG_BLURB[f]);
  return (
    <>
      <div className="attendance-check" aria-hidden>
        <svg viewBox="0 0 64 64" width="120" height="120">
          <circle cx="32" cy="32" r="30" fill="none" stroke="var(--status-success-fg)" strokeWidth="3" />
          <path
            d="M18 33 L28 43 L46 23"
            fill="none"
            stroke="var(--status-success-fg)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="attendance-done-title">You're checked in.</h1>
      {badges.length > 0 && (
        <div className="attendance-badges">
          {badges.map((b, i) => (
            <span key={`${b.label}-${i}`} className={`attendance-badge attendance-badge--${b.tone}`}>
              <span className="attendance-badge-dot" aria-hidden />
              {b.label}
            </span>
          ))}
        </div>
      )}
      {blurbs.length > 0 && (
        <div className="attendance-flags">
          {blurbs.map((f) => <p key={f}>{FLAG_BLURB[f]}</p>)}
          <p className="muted small">
            You're counted as here — these are just notes for you and your instructor to review together.
          </p>
        </div>
      )}
    </>
  );
}

interface Geo { lat: number; lon: number; accuracy: number }

function readGeolocation(): Promise<Geo | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const timeout = setTimeout(() => resolve(null), 8_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout);
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => { clearTimeout(timeout); resolve(null); },
      { enableHighAccuracy: true, timeout: 7_000, maximumAge: 0 },
    );
  });
}
