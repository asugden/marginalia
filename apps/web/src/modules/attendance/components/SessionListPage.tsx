// Instructor: open a new session or jump back into past ones.
// v1.0 §1 — courseId comes from the /course/:courseId/attendance URL
// segment. The legacy /attendance route is served by LegacyCourseRedirect
// (resolves the caller's default course and forwards), so this page is
// always mounted with :courseId present.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { exportCsvUrl, listSessions, openSession, type SessionDTO } from "../api.js";
import { Badge, Button, Checkbox, Field, Input } from "../../../components/index.js";
import { DownloadIcon, PlusIcon } from "../../../icons.js";

const DEFAULT_RADIUS = 75;

export function SessionListPage() {
  const navigate = useNavigate();
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId!;

  const [sessions, setSessions] = useState<SessionDTO[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [useGeofence, setUseGeofence] = useState(true);
  const [creating, setCreating] = useState(false);

  function reload() {
    listSessions(courseId)
      .then(setSessions)
      .catch((e) => setErr(String((e as Error).message)));
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [courseId]);

  const open = useCallback(async () => {
    setCreating(true); setErr(null);
    try {
      let lat: number | null = null;
      let lon: number | null = null;
      if (useGeofence) {
        const pos = await getInstructorPosition();
        if (!pos) {
          setErr("Couldn't read your location for the geofence. Allow location or uncheck the box.");
          setCreating(false);
          return;
        }
        lat = pos.lat; lon = pos.lon;
      }
      const s = await openSession({
        courseId,
        label,
        centerLat: lat,
        centerLon: lon,
        radiusM: useGeofence ? DEFAULT_RADIUS : null,
      });
      navigate(`/course/${courseId}/instructor/attendance/sessions/${s.id}`);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setCreating(false);
    }
  }, [courseId, label, useGeofence, navigate]);

  return (
    <div className="ds-staff-page">
      <div className="ds-staff-head">
        <div>
          <span className="eyebrow">Attendance</span>
          <h1>Sessions</h1>
          <div className="ds-staff-head__scope">
            Open a session and project the QR code; students scan it from their
            phones to check in. The code rotates every few seconds, so a
            screenshot won&rsquo;t travel.
          </div>
        </div>
      </div>

      <section className="ds-att-open">
        <h2>Open a new session</h2>
        <Field label="Label (optional)" htmlFor="att-label">
          <Input
            id="att-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Lecture 14 — Prototyping"
          />
        </Field>
        <Checkbox
          checked={useGeofence}
          onChange={(e) => setUseGeofence(e.target.checked)}
          label={`Use my current location as the classroom center (${DEFAULT_RADIUS} m radius)`}
        />
        <div>
          <Button
            variant="primary"
            icon={<PlusIcon size={16} />}
            onClick={open}
            loading={creating}
            disabled={creating}
          >
            Open session
          </Button>
        </div>
        {err && <p className="error">{err}</p>}
      </section>

      <h2 className="ds-att-history-h mono-label">Past sessions</h2>
      {sessions === null ? (
        <p className="muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="muted">No sessions yet.</p>
      ) : (
        <div className="ds-att-table">
          <div className="ds-att-table__head">
            <span>Date</span>
            <span>Label</span>
            <span>Status</span>
            <span />
          </div>
          {sessions.map((s) => (
            <div className="ds-att-table__row" key={s.id}>
              <span className="ds-att-table__date">{s.sessionDate}</span>
              <span className="ds-att-table__label">
                {s.label || <span className="muted">—</span>}
              </span>
              <span>
                {s.closedAt ? (
                  <Badge tone="neutral">closed</Badge>
                ) : (
                  <Badge tone="success" dot>
                    open
                  </Badge>
                )}
              </span>
              <span className="ds-att-table__actions">
                <Button
                  variant="ghost"
                  size="sm"
                  href={`/course/${courseId}/instructor/attendance/sessions/${s.id}`}
                >
                  {s.closedAt ? "View" : "Open"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  href={exportCsvUrl(s.id)}
                  icon={<DownloadIcon size={16} />}
                >
                  CSV
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getInstructorPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const timeout = setTimeout(() => resolve(null), 8_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timeout); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      () => { clearTimeout(timeout); resolve(null); },
      { enableHighAccuracy: true, timeout: 7_000, maximumAge: 0 },
    );
  });
}
