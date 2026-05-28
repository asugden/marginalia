// Single editor for new + existing agents.
//   title · voice picker · optional backbone (topics + budget + exit) ·
//   optional collection picker · optional model override.
//
// Save POSTs (new) or PUTs (existing) the full AgentDefinition.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { clarityNoteFor, type AgentDefinition } from "@marginalia/backbone";
import {
  createAgent,
  getAgent,
  listCollections,
  listVoices,
  updateAgent,
  type CollectionSummary,
  type VoiceListing,
} from "../client.js";
import { useCourse } from "../course/useCourse.js";
import { relativeTime } from "../time.js";

interface DraftTopic {
  id: string;
  title: string;
  guidance: string;
  turnBudget: string; // raw input; coerced on save
}

// v0.7 §1 — voice selection is a tagged pair: either a library id or a
// reference into the custom-voice table (owned or shared).
type VoiceSelection =
  | { kind: "library"; id: string }
  | { kind: "custom-ref"; voiceId: string };

interface Draft {
  title: string;
  voice: VoiceSelection;
  hasBackbone: boolean;
  defaultTurnBudget: string;
  exitCondition: string;
  completionMessage: string;
  topics: DraftTopic[];
  hasCollection: boolean;
  collectionId: string;      // "" when none chosen
  model: string;             // "" means default
  clarityNote: string;       // "" → student sees a shape-derived default
}

const MODEL_OPTIONS: Array<{ id: string; label: string; note?: string }> = [
  { id: "", label: "Default" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku", note: "cheap" },
  { id: "claude-sonnet-4-6", label: "Sonnet" },
  { id: "claude-opus-4-7", label: "Opus", note: "premium" },
];

const newTopic = (): DraftTopic => ({
  id: `t${Math.random().toString(36).slice(2, 7)}`,
  title: "",
  guidance: "",
  turnBudget: "",
});

const emptyDraft = (): Draft => ({
  title: "",
  voice: { kind: "library", id: "socratic" },
  hasBackbone: true,
  defaultTurnBudget: "3",
  exitCondition: "",
  completionMessage: "",
  topics: [newTopic()],
  hasCollection: false,
  collectionId: "",
  model: "",
  clarityNote: "",
});

function fromDefinition(title: string, def: AgentDefinition): Draft {
  // v0.7 §1 — accept all three voice shapes for backwards compatibility:
  //   - library: pass through.
  //   - custom-ref: pass through (current authoring form).
  //   - custom (inline): pre-v0.7 agents that pre-dated the per-author
  //     library. Treat their inline definition.id as a voice row id —
  //     it's the same string used in the voices table, so the row
  //     should exist if the migration backfilled it. If not, the user
  //     sees "Voice not shared with you" on save and can pick another.
  let voice: VoiceSelection;
  if (def.voice.kind === "library") {
    voice = { kind: "library", id: def.voice.id };
  } else if (def.voice.kind === "custom-ref") {
    voice = { kind: "custom-ref", voiceId: def.voice.voiceId };
  } else {
    voice = { kind: "custom-ref", voiceId: def.voice.definition.id };
  }
  return {
    title,
    voice,
    hasBackbone: !!def.backbone,
    defaultTurnBudget: def.backbone ? String(def.backbone.defaultTurnBudget) : "3",
    exitCondition: def.backbone?.exitCondition ?? "",
    completionMessage: def.backbone?.completionMessage ?? "",
    topics: def.backbone
      ? def.backbone.topics.map((t) => ({
          id: t.id,
          title: t.title,
          guidance: t.guidance ?? "",
          turnBudget: t.turnBudget !== undefined ? String(t.turnBudget) : "",
        }))
      : [newTopic()],
    hasCollection: !!def.collectionId,
    collectionId: def.collectionId ?? "",
    model: def.model ?? "",
    clarityNote: def.clarityNote ?? "",
  };
}

function toDefinition(draft: Draft): { definition: AgentDefinition; error?: string } {
  if (!draft.title.trim()) return { definition: null as never, error: "Title is required" };

  const def: AgentDefinition = {
    version: 2,
    voice: draft.voice,
  };

  if (draft.hasBackbone) {
    const defaultBudget = Number(draft.defaultTurnBudget);
    if (!Number.isInteger(defaultBudget) || defaultBudget < 1) {
      return { definition: null as never, error: "Default turn budget must be a positive integer" };
    }
    if (!draft.exitCondition.trim()) {
      return { definition: null as never, error: "Exit condition is required for a guided agent" };
    }
    if (draft.topics.length === 0) {
      return { definition: null as never, error: "Add at least one topic, or uncheck guided" };
    }
    const topics = [] as NonNullable<AgentDefinition["backbone"]>["topics"];
    for (const t of draft.topics) {
      if (!t.title.trim()) {
        return { definition: null as never, error: "Every topic needs a title" };
      }
      const topic: (typeof topics)[number] = {
        id: t.id,
        title: t.title.trim(),
      };
      if (t.guidance.trim()) topic.guidance = t.guidance.trim();
      if (t.turnBudget.trim()) {
        const n = Number(t.turnBudget);
        if (!Number.isInteger(n) || n < 1) {
          return { definition: null as never, error: `Turn budget for "${t.title}" must be a positive integer` };
        }
        topic.turnBudget = n;
      }
      topics.push(topic);
    }
    def.backbone = {
      defaultTurnBudget: defaultBudget,
      exitCondition: draft.exitCondition.trim(),
      topics,
    };
    if (draft.completionMessage.trim()) {
      def.backbone.completionMessage = draft.completionMessage.trim();
    }
  }

  if (draft.hasCollection) {
    if (!draft.collectionId) {
      return { definition: null as never, error: "Pick a collection or uncheck grounding" };
    }
    def.collectionId = draft.collectionId;
  }

  if (draft.model) def.model = draft.model;

  if (draft.clarityNote.trim()) def.clarityNote = draft.clarityNote.trim();

  return { definition: def };
}

export function AuthorEditPage() {
  const { courseId } = useCourse();
  const navigate = useNavigate();
  const { id: agentId } = useParams<{ id: string }>();
  const isNew = !agentId;

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [voices, setVoices] = useState<VoiceListing | null>(null);
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listVoices(courseId)
      .then(setVoices)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Voices failed"));
    listCollections(courseId)
      .then((r) => setCollections(r.collections))
      .catch(() => setCollections([]));
  }, [courseId]);

  useEffect(() => {
    if (isNew || !agentId) return;
    getAgent(courseId, agentId)
      .then((a) => setDraft(fromDefinition(a.title, a.definition)))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [agentId, isNew, courseId]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const updateTopic = (idx: number, patch: Partial<DraftTopic>) =>
    setDraft((d) => {
      const topics = d.topics.slice();
      topics[idx] = { ...topics[idx]!, ...patch };
      return { ...d, topics };
    });

  const addTopic = () =>
    setDraft((d) => ({ ...d, topics: [...d.topics, newTopic()] }));

  const removeTopic = (idx: number) =>
    setDraft((d) => ({ ...d, topics: d.topics.filter((_, i) => i !== idx) }));

  const moveTopic = (idx: number, dir: -1 | 1) =>
    setDraft((d) => {
      const topics = d.topics.slice();
      const swap = idx + dir;
      if (swap < 0 || swap >= topics.length) return d;
      [topics[idx], topics[swap]] = [topics[swap]!, topics[idx]!];
      return { ...d, topics };
    });

  // Live preview of the shape-derived default, shown as the placeholder
  // in the clarity field so the instructor sees what students get if they
  // leave it blank.
  const defaultClarity = clarityNoteFor({
    backbone: draft.hasBackbone ? {} : undefined,
    collectionId: draft.hasCollection && draft.collectionId ? draft.collectionId : undefined,
  });

  const libraryOptions = useMemo(() => voices?.library ?? [], [voices]);
  const ownedOptions = useMemo(() => voices?.owned ?? [], [voices]);
  const sharedOptions = useMemo(() => voices?.shared ?? [], [voices]);

  function pickLibrary(id: string) {
    setDraft((d) => ({ ...d, voice: { kind: "library", id } }));
  }
  function pickCustom(voiceId: string) {
    setDraft((d) => ({ ...d, voice: { kind: "custom-ref", voiceId } }));
  }
  function isPicked(sel: VoiceSelection): boolean {
    if (draft.voice.kind !== sel.kind) return false;
    if (sel.kind === "library" && draft.voice.kind === "library") {
      return sel.id === draft.voice.id;
    }
    if (sel.kind === "custom-ref" && draft.voice.kind === "custom-ref") {
      return sel.voiceId === draft.voice.voiceId;
    }
    return false;
  }

  async function save() {
    setSaveError(null);
    const { definition, error: validation } = toDefinition(draft);
    if (validation) {
      setSaveError(validation);
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await createAgent(courseId, draft.title.trim(), definition);
      } else {
        await updateAgent(courseId, agentId!, draft.title.trim(), definition);
      }
      navigate(`/course/${courseId}/agents`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section>
        <p className="muted">Loading…</p>
      </section>
    );
  }

  return (
    <section>
      <header className="sub-header">
        <h2>{isNew ? "New agent" : "Edit agent"}</h2>
        <Link to={`/course/${courseId}/agents`} className="link-button subtle">
          ← All agents
        </Link>
      </header>

      {loadError && <p className="error">{loadError}</p>}

        <label className="field">
          <span className="field-label">Title</span>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">What students see first (optional)</span>
          <textarea
            rows={2}
            value={draft.clarityNote}
            placeholder={defaultClarity}
            onChange={(e) => update("clarityNote", e.target.value)}
          />
          <span className="muted small">
            A short note shown at the top of every conversation, so students
            know what this is and how it behaves. Leave blank to use the
            default above. This is for clarity, not rules — students read it;
            the agent still works the way you configured it.
          </span>
        </label>

        <section className="field-group">
          <h2>Voice</h2>
          <p className="muted small">
            How the agent talks.{" "}
            <Link to="/author/voices">Manage your voices →</Link>
          </p>

          <h3 style={{ font: "600 0.85rem var(--font-sans)", letterSpacing: "0.02em", color: "var(--ink-soft)", margin: "0.5rem 0 0.4rem", textTransform: "uppercase" }}>
            Library
          </h3>
          <div className="radio-cards">
            {libraryOptions.map((v) => (
              <label
                key={v.id}
                className={`radio-card ${isPicked({ kind: "library", id: v.id }) ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="voice"
                  value={`lib:${v.id}`}
                  checked={isPicked({ kind: "library", id: v.id })}
                  onChange={() => pickLibrary(v.id)}
                />
                <strong>{v.name}</strong>
                <span className="muted small">{v.description}</span>
                <Link
                  to={`/author/voices/${v.id}`}
                  className="muted small"
                  style={{ marginTop: "0.25rem" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Customize →
                </Link>
              </label>
            ))}
          </div>

          {ownedOptions.length > 0 && (
            <>
              <h3 style={{ font: "600 0.85rem var(--font-sans)", letterSpacing: "0.02em", color: "var(--ink-soft)", margin: "1.25rem 0 0.4rem", textTransform: "uppercase" }}>
                My voices
              </h3>
              <div className="radio-cards">
                {ownedOptions.map((v) => (
                  <label
                    key={v.id}
                    className={`radio-card ${isPicked({ kind: "custom-ref", voiceId: v.id }) ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="voice"
                      value={`own:${v.id}`}
                      checked={isPicked({ kind: "custom-ref", voiceId: v.id })}
                      onChange={() => pickCustom(v.id)}
                    />
                    <strong>{v.name}</strong>
                    <span className="muted small">{v.description}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {sharedOptions.length > 0 && (
            <>
              <h3 style={{ font: "600 0.85rem var(--font-sans)", letterSpacing: "0.02em", color: "var(--ink-soft)", margin: "1.25rem 0 0.4rem", textTransform: "uppercase" }}>
                Shared with me
              </h3>
              <div className="radio-cards">
                {sharedOptions.map((v) => (
                  <label
                    key={v.id}
                    className={`radio-card ${isPicked({ kind: "custom-ref", voiceId: v.id }) ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="voice"
                      value={`shr:${v.id}`}
                      checked={isPicked({ kind: "custom-ref", voiceId: v.id })}
                      onChange={() => pickCustom(v.id)}
                    />
                    <strong>{v.name}</strong>
                    <span className="muted small">{v.description}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="field-group">
          <h2>Outline</h2>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.hasBackbone}
              onChange={(e) => update("hasBackbone", e.target.checked)}
            />
            <span>
              Lead the student through an outline — a set sequence of topics,
              each with a turn budget, ending on a condition you define. When
              off, the conversation is open Q&amp;A with the chosen voice.
            </span>
          </label>

          {draft.hasBackbone && (
            <div className="backbone-editor">
              <div className="inline-fields">
                <label className="field small">
                  <span className="field-label">Default turn budget</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.defaultTurnBudget}
                    onChange={(e) => update("defaultTurnBudget", e.target.value)}
                  />
                </label>
              </div>

              <label className="field">
                <span className="field-label">Exit condition</span>
                <textarea
                  rows={2}
                  value={draft.exitCondition}
                  placeholder="What does mastery look like at the end of the conversation?"
                  onChange={(e) => update("exitCondition", e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">Completion message (optional)</span>
                <textarea
                  rows={2}
                  value={draft.completionMessage}
                  placeholder="Shown to the student when the conversation finishes."
                  onChange={(e) => update("completionMessage", e.target.value)}
                />
              </label>

              <div className="topics">
                <div className="topics-header">
                  <strong>Topics</strong>
                  <button
                    type="button"
                    className="subtle"
                    onClick={addTopic}
                  >
                    + Add topic
                  </button>
                </div>
                {draft.topics.map((t, i) => (
                  <div key={t.id} className="topic-row">
                    <div className="topic-row-head">
                      <span className="muted small">Topic {i + 1}</span>
                      <div className="topic-row-actions">
                        <button
                          type="button"
                          className="subtle icon"
                          onClick={() => moveTopic(i, -1)}
                          disabled={i === 0}
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="subtle icon"
                          onClick={() => moveTopic(i, 1)}
                          disabled={i === draft.topics.length - 1}
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="subtle icon danger"
                          onClick={() => removeTopic(i)}
                          disabled={draft.topics.length === 1}
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={t.title}
                      placeholder="Frame the author's central claim"
                      onChange={(e) => updateTopic(i, { title: e.target.value })}
                    />
                    <input
                      type="text"
                      value={t.guidance}
                      placeholder="Optional guidance to the agent for this topic"
                      onChange={(e) => updateTopic(i, { guidance: e.target.value })}
                    />
                    <input
                      type="number"
                      min={1}
                      value={t.turnBudget}
                      placeholder={`Budget (default ${draft.defaultTurnBudget || "—"})`}
                      onChange={(e) => updateTopic(i, { turnBudget: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="field-group">
          <h2>Sources</h2>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.hasCollection}
              onChange={(e) => update("hasCollection", e.target.checked)}
            />
            <span>
              Ground replies in a library of documents. Relevant passages are
              added to the agent's context each turn, and the agent cites them
              in line so students can check the source.
            </span>
          </label>

          {draft.hasCollection && (
            <div className="corpus-picker">
              {collections === null ? (
                <p className="muted small">Loading libraries…</p>
              ) : collections.length === 0 ? (
                <p className="muted small">
                  No libraries yet.{" "}
                  <Link to={`/course/${courseId}/collections`}>
                    Create one and add sources
                  </Link>.
                </p>
              ) : (
                <>
                  <span className="field-label">Library</span>
                  <div className="radio-cards">
                    {collections.map((c) => (
                      <label
                        key={c.id}
                        className={`radio-card compact ${draft.collectionId === c.id ? "selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="collection"
                          value={c.id}
                          checked={draft.collectionId === c.id}
                          onChange={() => update("collectionId", c.id)}
                        />
                        <strong>{c.name}</strong>
                        <span className="muted small">
                          {c.sourceCount}{" "}
                          {c.sourceCount === 1 ? "source" : "sources"}
                          {" · "}updated {relativeTime(c.updatedAt)}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="muted small">
                    <Link to={`/course/${courseId}/collections`}>Manage libraries →</Link>
                  </p>
                </>
              )}
            </div>
          )}
        </section>

        <section className="field-group">
          <h2>Model</h2>
          <div className="radio-cards inline">
            {MODEL_OPTIONS.map((m) => (
              <label
                key={m.id || "default"}
                className={`radio-card compact ${draft.model === m.id ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="model"
                  value={m.id}
                  checked={draft.model === m.id}
                  onChange={() => update("model", m.id)}
                />
                <strong>{m.label}</strong>
                {m.note && <span className="muted small">{m.note}</span>}
              </label>
            ))}
          </div>
        </section>

        {saveError && <p className="error">{saveError}</p>}

        <div className="form-actions">
          <Link to={`/course/${courseId}/agents`} className="link-button subtle">
            Cancel
          </Link>
          <button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isNew ? "Create agent" : "Save changes"}
          </button>
        </div>
    </section>
  );
}
