// Instructor projector view. Big QR + live roster + present count. Staff
// register: no card framing, comfortable max-width, brand-red only on the
// primary "Close session" action.
//
// The QR encodes the stable check-in URL with the currently-valid rotating
// token appended as ?t=...; we refresh the token client-side every 5s so a
// 30s server-side rotation never leaves the projector showing a stale code.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import {
  closeSession,
  exportCsvUrl,
  getQrToken,
  getSession,
  type CheckinDTO,
  type QrToken,
  type SessionDTO,
} from "../api.js";

const TOKEN_POLL_MS = 5_000;
const ROSTER_POLL_MS = 4_000;

export function DisplayPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDTO | null>(null);
  const [checkins, setCheckins] = useState<CheckinDTO[]>([]);
  const [token, setToken] = useState<QrToken | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string>("");
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await getSession(id);
        if (cancelled) return;
        setSession(data.session);
        setCheckins(data.checkins);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(String((e as Error).message));
      }
    };
    void tick();
    const interval = setInterval(tick, ROSTER_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const t = await getQrToken(id);
        if (!cancelled) setToken(t);
      } catch { /* retry next tick */ }
    };
    void tick();
    const interval = setInterval(tick, TOKEN_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [id]);

  const qrUrl = useMemo(() => {
    if (!session || !token) return "";
    return `${session.checkInUrl}?t=${encodeURIComponent(token.token)}`;
  }, [session, token]);

  useEffect(() => {
    if (!qrUrl) { setQrSvg(""); return; }
    QRCode.toString(qrUrl, { type: "svg", margin: 1, width: 520 })
      .then(setQrSvg)
      .catch(() => setQrSvg(""));
  }, [qrUrl]);

  const onClose = useCallback(async () => {
    if (!id) return;
    if (!confirm("Close this session? Students will no longer be able to check in.")) return;
    try {
      await closeSession(id);
      const data = await getSession(id);
      setSession(data.session);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }, [id]);

  if (err) return (
    <div className="page staff"><div className="staff-frame"><p className="error">{err}</p></div></div>
  );
  if (!session) return (
    <div className="page staff"><div className="staff-frame"><p className="muted">Loading…</p></div></div>
  );

  const present = checkins.filter((c) => c.flags.length === 0).length;
  const flagged = checkins.length - present;

  return (
    <div className="page staff">
      <div className="staff-frame">
        <header className="card-header">
          <h1>{session.label || "Attendance"} — {session.sessionDate}</h1>
          <div className="header-actions">
            <Link to="/attendance" className="link-button subtle">← All sessions</Link>
            <a href={exportCsvUrl(id)} className="link-button subtle">Export CSV</a>
            {!session.closedAt && (
              <button type="button" onClick={onClose}>Close session</button>
            )}
          </div>
        </header>

        {session.closedAt ? (
          <p className="muted">
            This session is closed. No new check-ins will be accepted.
          </p>
        ) : (
          <p className="muted">
            Students scan the code or visit <code>{session.checkInUrl}</code>.
          </p>
        )}

        <div className="attendance-display">
          <div className="attendance-qr-wrap">
            {session.closedAt ? (
              <div className="attendance-qr-closed">Session closed</div>
            ) : (
              <>
                <button
                  type="button"
                  className="attendance-qr-button"
                  onClick={() => setZoomed(true)}
                  title="Click to fill the screen"
                  aria-label="Enlarge QR code"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <p className="muted small">Click the code to fill the screen.</p>
              </>
            )}
          </div>

          <aside className="attendance-roster">
            <div className="attendance-count">
              <span className="attendance-count-num">{present}</span>
              <span className="attendance-count-label">present</span>
            </div>
            {flagged > 0 && (
              <div className="attendance-flagged-count">
                {flagged} to review together
              </div>
            )}
            <div className="attendance-roster-list">
              {checkins.length === 0 && (
                <div className="muted small">No check-ins yet.</div>
              )}
              {checkins.map((c) => (
                <div key={c.id} className="attendance-roster-row">
                  <span className="attendance-roster-name">{c.displayName || c.email || c.userId}</span>
                  {c.flags.length > 0
                    ? <span className="attendance-row-flag">to review</span>
                    : <span className="attendance-row-ok" aria-label="checked in">✓</span>}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {zoomed && (
        <button
          type="button"
          className="attendance-zoom-overlay"
          onClick={() => setZoomed(false)}
          aria-label="Close enlarged QR"
        >
          <div className="attendance-zoom-inner" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="attendance-zoom-url">{session.checkInUrl}</div>
        </button>
      )}
    </div>
  );
}
