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
import { useCourse } from "../../../course/useCourse.js";
import {
  closeSession,
  exportCsvUrl,
  getQrToken,
  getSession,
  type CheckinDTO,
  type QrToken,
  type SessionDTO,
} from "../api.js";
import { Badge, Button, Wordmark, useConfirm } from "../../../components/index.js";
import { CheckIcon, DownloadIcon, FlagIcon } from "../../../icons.js";

const TOKEN_POLL_MS = 5_000;
const ROSTER_POLL_MS = 4_000;

// Short, projector-legible labels per flag (matches the design kit's
// FLAG_LABEL). Anything unmapped falls back to its raw key.
const FLAG_LABEL: Record<string, string> = {
  no_location: "no location",
  no_geofence: "no geofence",
  outside_radius: "outside room",
  duplicate_device: "repeat device",
  duplicate_cookie: "repeat device",
  late: "late",
};

export function DisplayPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { courseId } = useCourse();
  const sessionsHref = `/course/${courseId}/instructor/attendance`;
  const [session, setSession] = useState<SessionDTO | null>(null);
  const [checkins, setCheckins] = useState<CheckinDTO[]>([]);
  const [token, setToken] = useState<QrToken | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string>("");
  const [zoomed, setZoomed] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

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
    if (
      !(await confirm({
        title: "Close this session?",
        body: "Students will no longer be able to check in.",
        confirmLabel: "Close session",
      }))
    )
      return;
    try {
      await closeSession(id);
      const data = await getSession(id);
      setSession(data.session);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }, [id, confirm]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="ds-staff">
      <header className="ds-staff-top">
        <Link to={sessionsHref} aria-label="All sessions">
          <Wordmark size="sm" />
        </Link>
        <span className="ds-staff-top__role">Attendance</span>
      </header>
      <div className="ds-staff-page ds-att-page--wide">{children}</div>
    </div>
  );

  if (err)
    return (
      <Shell>
        <p className="error">{err}</p>
      </Shell>
    );
  if (!session)
    return (
      <Shell>
        <p className="muted">Loading…</p>
      </Shell>
    );

  const present = checkins.filter((c) => c.flags.length === 0).length;
  const flagged = checkins.length - present;

  return (
    <div className="ds-staff">
      <header className="ds-staff-top">
        <Link to={sessionsHref} aria-label="All sessions">
          <Wordmark size="sm" />
        </Link>
        <span className="ds-staff-top__role">Attendance</span>
      </header>
      <div className="ds-staff-page" style={{ maxWidth: "1080px" }}>
        <div className="ds-staff-head">
          <div>
            <span className="eyebrow">Live session</span>
            <h1>{session.label || "Attendance"}</h1>
            <div className="ds-staff-head__scope">{session.sessionDate}</div>
          </div>
          <div className="ds-staff-actions">
            <Button variant="ghost" size="sm" href={sessionsHref}>
              All sessions
            </Button>
            <Button
              variant="subtle"
              size="sm"
              href={exportCsvUrl(id)}
              icon={<DownloadIcon size={16} />}
            >
              Export CSV
            </Button>
            {!session.closedAt && (
              <Button variant="primary" size="sm" onClick={onClose}>
                Close session
              </Button>
            )}
          </div>
        </div>

        <p className="ds-att-display__lead">
          {session.closedAt ? (
            "This session is closed. No new check-ins will be accepted."
          ) : (
            <>
              Scan the code or open <code>{session.checkInUrl}</code> on your
              phone. The code refreshes every few seconds.
            </>
          )}
        </p>

        <div className="ds-att-display">
          <div className="ds-att-qr">
            {session.closedAt ? (
              <div className="muted">Session closed</div>
            ) : (
              <>
                <button
                  type="button"
                  className="ds-att-qr__frame"
                  onClick={() => setZoomed(true)}
                  title="Click to fill the screen"
                  aria-label="Enlarge QR code"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <div className="ds-att-qr__url">{session.checkInUrl}</div>
                <div className="ds-att-qr__hint">
                  Click the code to project it full-screen
                </div>
              </>
            )}
          </div>

          <aside className="ds-att-roster">
            <div className="ds-att-count">
              <span className="ds-att-count__num">{present}</span>
              <span className="ds-att-count__label">checked in</span>
            </div>
            {flagged > 0 && (
              <div className="ds-att-review">
                <FlagIcon />
                <span>{flagged} to review together after class</span>
              </div>
            )}
            <div className="ds-att-roster__list">
              {checkins.length === 0 && (
                <div className="muted small">No check-ins yet.</div>
              )}
              {checkins.map((c) => (
                <div key={c.id} className="ds-att-roster__row">
                  <span className="ds-att-roster__name">
                    {c.displayName || c.email || c.userId}
                  </span>
                  {c.flags.length > 0 ? (
                    <Badge tone="warning">
                      {c.flags.map((f) => FLAG_LABEL[f] ?? f).join(", ")}
                    </Badge>
                  ) : (
                    <span className="ds-att-roster__ok" aria-label="checked in">
                      <CheckIcon size={14} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {zoomed && (
        <button
          type="button"
          className="ds-att-zoom"
          onClick={() => setZoomed(false)}
          aria-label="Close enlarged QR"
        >
          <div className="ds-att-zoom__inner" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="ds-att-zoom__url">{session.checkInUrl}</div>
        </button>
      )}
      {confirmDialog}
    </div>
  );
}
