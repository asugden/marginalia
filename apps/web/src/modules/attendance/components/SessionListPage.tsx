// Instructor: open a new session or jump back into past ones.
// Course id comes from ?courseId=, defaulting to DEMO_COURSE for the
// current single-course deployment (matches AuthorListPage / RosterPage).

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DEMO_COURSE } from "../../../course.js";
import { exportCsvUrl, listSessions, openSession, type SessionDTO } from "../api.js";

const DEFAULT_RADIUS = 75;

export function SessionListPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const courseId = search.get("courseId") ?? DEMO_COURSE;

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
      navigate(`/attendance/sessions/${s.id}`);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setCreating(false);
    }
  }, [courseId, label, useGeofence, navigate]);

  return (
    <div className="page staff">
      <div className="staff-frame">
        <header className="card-header">
          <h1>Attendance</h1>
          <div className="header-actions">
            <Link to="/" className="link-button subtle">← Student view</Link>
            <Link to="/author/agents" className="link-button subtle">Agents</Link>
            <Link to="/author/roster" className="link-button subtle">Roster</Link>
          </div>
        </header>

        <section className="attendance-open-card">
          <h2>Open a new session</h2>
          <div className="field">
            <label htmlFor="att-label">Label (optional)</label>
            <input
              id="att-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Lecture 14"
            />
          </div>
          <label className="attendance-geofence-toggle">
            <input
              type="checkbox"
              checked={useGeofence}
              onChange={(e) => setUseGeofence(e.target.checked)}
            />{" "}
            Use my current location as the classroom center ({DEFAULT_RADIUS} m radius)
          </label>
          <div className="attendance-actions">
            <button type="button" onClick={open} disabled={creating}>
              {creating ? "Opening…" : "Open session"}
            </button>
          </div>
          {err && <p className="error">{err}</p>}
        </section>

        <h2 className="attendance-history-h2">Past sessions</h2>
        {sessions === null ? (
          <p className="muted">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="muted">No sessions yet.</p>
        ) : (
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Label</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.sessionDate}</td>
                  <td>{s.label || <span className="muted">—</span>}</td>
                  <td>{s.closedAt ? "closed" : <strong>open</strong>}</td>
                  <td className="attendance-row-actions">
                    <Link to={`/attendance/sessions/${s.id}`} className="link-button subtle">
                      Open
                    </Link>
                    <a href={exportCsvUrl(s.id)} className="link-button subtle">CSV</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
