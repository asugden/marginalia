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
import { Badge, Button, Field, Input } from "../components/index.js";
import { BookIcon, PlusIcon } from "../icons.js";

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
      navigate(`/course/${courseId}/instructor/collections/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="app-page">
      <div className="app-page__head">
        <div>
          <span className="eyebrow">Instructor · Sources</span>
          <h1>Libraries</h1>
          <div className="app-page__scope">
            A library is a set of documents you attach to an agent. The agent
            answers from these sources and cites them in line.
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="app-section">
        <span className="mono-label app-section__label">New library</span>
        <div className="app-row">
          <Field label="Name">
            <Input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
          </Field>
          <Field label="Description (optional)">
            <Input
              type="text"
              value={draftDescription}
              placeholder="What's in this library?"
              onChange={(e) => setDraftDescription(e.target.value)}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <Button
              variant="primary"
              icon={<PlusIcon size={16} />}
              onClick={create}
              loading={creating}
              disabled={creating || !draftName.trim()}
            >
              Create library
            </Button>
          </div>
        </div>
      </div>

      <div className="app-section">
        <span className="mono-label app-section__label">Your libraries</span>
        {collections === null ? (
          <p className="muted">Loading…</p>
        ) : collections.length === 0 ? (
          <p className="muted">No libraries yet.</p>
        ) : (
          <div className="app-list">
            {collections.map((c) => (
              <Link
                key={c.id}
                to={`/course/${courseId}/instructor/collections/${c.id}`}
                className="app-list__row"
              >
                <span className="app-coll-ic" aria-hidden>
                  <BookIcon size={20} />
                </span>
                <div className="app-list__main">
                  <div className="app-list__title">{c.name}</div>
                  <div className="app-list__sub">
                    {c.description ? `${c.description} · ` : ""}
                    {c.sourceCount} {c.sourceCount === 1 ? "source" : "sources"} ·
                    updated {relativeTime(c.updatedAt)}
                  </div>
                </div>
                <div className="app-list__meta">
                  <Badge tone="neutral">{c.sourceCount}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
