// Instructor index of source collections. Each collection is a bag of
// documents that can be attached to one or more agents. Authoring lives here,
// not on the agent page, because uploading + waiting for indexing is a
// different verb from picking options on a form.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createCollection,
  listCollections,
  type CollectionSummary,
} from "../client.js";
import { useCourse } from "../course/useCourse.js";
import { relativeTime } from "../time.js";

export function CollectionsListPage() {
  const { courseId } = useCourse();
  const navigate = useNavigate();
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  function reload() {
    setError(null);
    listCollections(courseId)
      .then((r) => setCollections(r.collections))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [courseId]);

  async function create() {
    if (!draftName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createCollection(
        courseId,
        draftName.trim(),
        draftDescription.trim() || undefined,
      );
      // Clear inputs *before* navigating so back-button returns show an empty
      // form, not the just-submitted values (per v0.4 plan §3).
      setDraftName("");
      setDraftDescription("");
      navigate(`/course/${courseId}/collections/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section>
      <p className="scope-note">
        A library is a set of documents you attach to an agent. The agent
        answers from these sources and cites them in line.
      </p>

      {error && <p className="error">{error}</p>}

      <section className="field-group">
        <h2>New library</h2>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Description (optional)</span>
          <input
            type="text"
            value={draftDescription}
            placeholder="What's in this library?"
            onChange={(e) => setDraftDescription(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <button onClick={create} disabled={creating || !draftName.trim()}>
            {creating ? "Creating…" : "Create library"}
          </button>
        </div>
      </section>

      <section className="field-group">
        <h2>Your libraries</h2>
        {collections === null ? (
          <p className="muted">Loading…</p>
        ) : collections.length === 0 ? (
          <p className="muted">No libraries yet.</p>
        ) : (
          <ul className="assignment-list">
            {collections.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  {c.description && (
                    <span className="muted small"> · {c.description}</span>
                  )}
                  <div
                    className="muted small"
                    title={new Date(c.updatedAt).toLocaleString()}
                  >
                    {c.sourceCount} {c.sourceCount === 1 ? "source" : "sources"}
                    {" · "}updated {relativeTime(c.updatedAt)}
                  </div>
                </div>
                <Link
                  to={`/course/${courseId}/collections/${c.id}`}
                  className="link-button subtle"
                >
                  Manage sources
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
