// v1.1 — instructor results view for a hidden A/B split.
//
// Shows which arm each student was randomly assigned and how many
// conversations they've had on this agent, grouped by arm. Students never
// see any of this; it's the "reveal" surface the instructor reads out of
// band ("half of you were talking to a tutor that argued the opposite
// side..."). Export to CSV for analysis alongside handed-in work.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getVariantResults,
  type VariantResults,
  type VariantResultStudent,
} from "../client.js";
import { useCourse } from "../course/useCourse.js";
import { Badge, Button } from "../components/index.js";

function toCsv(results: VariantResults): string {
  const header = ["email", "name", "variant_id", "variant_label", "threads"];
  const rows = results.students.map((s) =>
    [
      s.email,
      s.displayName ?? "",
      s.variantId,
      s.variantLabel ?? "(removed arm)",
      String(s.threadCount),
    ]
      // Quote every field and escape embedded quotes — labels and names are
      // free text and can contain commas.
      .map((f) => `"${f.replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function AuthorVariantResultsPage() {
  const { courseId } = useCourse();
  const { id: agentId } = useParams<{ id: string }>();
  const [data, setData] = useState<VariantResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    getVariantResults(courseId, agentId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [courseId, agentId]);

  // Group students by arm, in the definition's arm order. Any assignment to
  // an arm since removed from the definition falls into a trailing bucket.
  const grouped = useMemo(() => {
    if (!data) return [];
    const order = data.variants.map((v) => v.id);
    const byId = new Map<string, { label: string | null; students: VariantResultStudent[] }>();
    for (const v of data.variants) byId.set(v.id, { label: v.label, students: [] });
    for (const s of data.students) {
      let bucket = byId.get(s.variantId);
      if (!bucket) {
        bucket = { label: s.variantLabel, students: [] };
        byId.set(s.variantId, bucket);
      }
      bucket.students.push(s);
    }
    // Definition arms first (in order), then any orphaned arms.
    const ids = [...order, ...[...byId.keys()].filter((k) => !order.includes(k))];
    return ids.map((id) => ({ id, ...byId.get(id)! }));
  }, [data]);

  function downloadCsv() {
    if (!data) return;
    const blob = new Blob([toCsv(data)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `variant-results-${data.title.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalAssigned = data?.students.length ?? 0;

  return (
    <div className="app-page">
      <div className="app-page__head">
        <div>
          <span className="eyebrow">Instructor · Hidden variants</span>
          <h1>{data ? data.title : "Results"}</h1>
          <div className="app-page__scope">
            Which secret arm each student was assigned, and how many
            conversations they&rsquo;ve had. Students never see this — reveal
            it when you&rsquo;re ready.
          </div>
        </div>
        <div className="app-page__actions">
          <Button
            variant="subtle"
            href={`/course/${courseId}/instructor/agents/${agentId}`}
          >
            Edit agent
          </Button>
          <Button variant="primary" onClick={downloadCsv} disabled={!data || totalAssigned === 0}>
            Download CSV
          </Button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {data === null ? (
        <p className="muted">Loading…</p>
      ) : totalAssigned === 0 ? (
        <p className="app-empty">
          No students have started this agent yet. Arms are assigned on a
          student&rsquo;s first conversation, so this fills in as they begin.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
          {grouped.map((g) => (
            <div key={g.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  marginBottom: "0.6rem",
                }}
              >
                <span className="mono-label">{g.label ?? "(removed arm)"}</span>
                <Badge tone="neutral">
                  {g.students.length} student{g.students.length === 1 ? "" : "s"}
                </Badge>
              </div>
              {g.students.length === 0 ? (
                <p className="muted small">No one assigned to this arm yet.</p>
              ) : (
                <div className="app-list">
                  {g.students.map((s) => (
                    <div className="app-list__row" key={s.userId}>
                      <div className="app-list__main">
                        <div className="app-list__title">
                          {s.displayName || s.email}
                        </div>
                        {s.displayName && (
                          <div className="app-list__sub muted small">{s.email}</div>
                        )}
                      </div>
                      <div className="app-list__meta">
                        <Badge tone="ghost">
                          {s.threadCount} thread{s.threadCount === 1 ? "" : "s"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
