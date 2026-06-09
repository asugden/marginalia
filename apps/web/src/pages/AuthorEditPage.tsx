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
import {
  Badge,
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  RadioCard,
  RadioCardGroup,
  Textarea,
} from "../components/index.js";
import { CheckIcon, ChevronIcon, DragIcon, PlusIcon, TrashIcon } from "../icons.js";

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
  // Which topic is expanded in the outline editor (kit shows one open at a time).
  const [openTopic, setOpenTopic] = useState(0);

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
      <div className="ds-staff-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="ds-staff-page">
      <div className="ds-staff-head">
        <div>
          <span className="eyebrow">Author · Guided agent</span>
          <h1>{isNew ? "New agent" : draft.title || "Edit agent"}</h1>
          <div className="ds-staff-head__scope">
            Students see this agent on their home page. It leads them through
            the outline below.
          </div>
        </div>
        <div className="ds-staff-actions">
          <Button variant="subtle" href={`/course/${courseId}/agents`}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<CheckIcon size={16} />}
            onClick={save}
            loading={saving}
            disabled={saving}
          >
            {isNew ? "Create agent" : "Save changes"}
          </Button>
        </div>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      <div className="ds-staff-section ds-staff-row">
        <Field label="Agent title">
          <Input
            type="text"
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </Field>
      </div>

      <div className="ds-staff-section">
        <Field
          label="What students see first (optional)"
          hint="A short note shown at the top of every conversation, so students know what this is and how it behaves. Leave blank to use the default. This is for clarity, not rules — the agent still works the way you configure it."
        >
          <Textarea
            rows={2}
            value={draft.clarityNote}
            placeholder={defaultClarity}
            onChange={(e) => update("clarityNote", e.target.value)}
          />
        </Field>
      </div>

      <div className="ds-staff-section">
        <span className="mono-label ds-staff-section__label">Voice</span>
        <p className="muted small" style={{ marginTop: "-0.3rem", marginBottom: "0.7rem" }}>
          How the agent talks. <Link to="/author/voices">Manage your voices →</Link>
        </p>
        <h3 className="mono-label" style={{ margin: "0.3rem 0 0.4rem" }}>Library</h3>
        <RadioCardGroup>
          {libraryOptions.map((v) => (
            <RadioCard
              key={v.id}
              name="voice"
              value={`lib:${v.id}`}
              title={v.name}
              description={v.description}
              selected={isPicked({ kind: "library", id: v.id })}
              onChange={() => pickLibrary(v.id)}
            />
          ))}
        </RadioCardGroup>

        {ownedOptions.length > 0 && (
          <>
            <h3 className="mono-label" style={{ margin: "1.25rem 0 0.4rem" }}>My voices</h3>
            <RadioCardGroup>
              {ownedOptions.map((v) => (
                <RadioCard
                  key={v.id}
                  name="voice"
                  value={`own:${v.id}`}
                  title={v.name}
                  description={v.description}
                  selected={isPicked({ kind: "custom-ref", voiceId: v.id })}
                  onChange={() => pickCustom(v.id)}
                />
              ))}
            </RadioCardGroup>
          </>
        )}

        {sharedOptions.length > 0 && (
          <>
            <h3 className="mono-label" style={{ margin: "1.25rem 0 0.4rem" }}>Shared with me</h3>
            <RadioCardGroup>
              {sharedOptions.map((v) => (
                <RadioCard
                  key={v.id}
                  name="voice"
                  value={`shr:${v.id}`}
                  title={v.name}
                  description={v.description}
                  selected={isPicked({ kind: "custom-ref", voiceId: v.id })}
                  onChange={() => pickCustom(v.id)}
                />
              ))}
            </RadioCardGroup>
          </>
        )}
      </div>

      <div className="ds-staff-section">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.7rem",
          }}
        >
          <span className="mono-label">Outline</span>
          {draft.hasBackbone && (
            <Badge tone="neutral">State machine · enforced in code</Badge>
          )}
        </div>
        <Checkbox
          checked={draft.hasBackbone}
          onChange={(e) => update("hasBackbone", e.target.checked)}
          label="Lead the student through an outline"
          description="A set sequence of topics, each with a turn budget, ending on a condition you define. When off, the conversation is open Q&A with the chosen voice."
        />

        {draft.hasBackbone && (
          <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="ds-staff-row">
              <Field label="Default turn budget" hint="Max student turns before nudging on.">
                <Input
                  type="number"
                  min={1}
                  mono
                  value={draft.defaultTurnBudget}
                  onChange={(e) => update("defaultTurnBudget", e.target.value)}
                  style={{ maxWidth: 120 }}
                />
              </Field>
            </div>

            <Field label="Exit condition" hint="What does mastery look like at the end? Enforced in code, not a hope.">
              <Textarea
                rows={2}
                value={draft.exitCondition}
                placeholder="What does mastery look like at the end of the conversation?"
                onChange={(e) => update("exitCondition", e.target.value)}
              />
            </Field>

            <Field label="Completion message (optional)">
              <Textarea
                rows={2}
                value={draft.completionMessage}
                placeholder="Shown to the student when the conversation finishes."
                onChange={(e) => update("completionMessage", e.target.value)}
              />
            </Field>

            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.7rem",
                }}
              >
                <span className="mono-label">
                  {draft.topics.length} topic{draft.topics.length === 1 ? "" : "s"}
                </span>
              </div>

              {draft.topics.map((t, i) => {
                const open = openTopic === i;
                return (
                  <div key={t.id} className={"ds-topic" + (open ? " ds-topic--open" : "")}>
                    <div
                      className="ds-topic__head"
                      onClick={() => setOpenTopic(open ? -1 : i)}
                    >
                      <span className="ds-topic__drag" title="Reorder (use the arrows when expanded)" aria-hidden>
                        <DragIcon size={18} />
                      </span>
                      <span className="ds-topic__num">{i + 1}</span>
                      <span className="ds-topic__title">
                        {t.title || <span className="muted">Untitled topic</span>}
                      </span>
                      {t.turnBudget.trim() && (
                        <span className="ds-topic__budget">{t.turnBudget} turns</span>
                      )}
                      <span className="ds-topic__chev">
                        <ChevronIcon size={18} />
                      </span>
                    </div>
                    {open && (
                      <div className="ds-topic__body">
                        <Field label="Topic prompt" hint="What the agent opens this topic with.">
                          <Input
                            type="text"
                            value={t.title}
                            placeholder="Frame the author's central claim"
                            onChange={(e) => updateTopic(i, { title: e.target.value })}
                          />
                        </Field>
                        <Field label="Guidance (optional)">
                          <Input
                            type="text"
                            value={t.guidance}
                            placeholder="Optional guidance to the agent for this topic"
                            onChange={(e) => updateTopic(i, { guidance: e.target.value })}
                          />
                        </Field>
                        <div className="ds-staff-row">
                          <Field
                            label="Turn budget"
                            hint={`Default ${draft.defaultTurnBudget || "—"}.`}
                          >
                            <Input
                              type="number"
                              min={1}
                              mono
                              value={t.turnBudget}
                              placeholder={draft.defaultTurnBudget || ""}
                              onChange={(e) => updateTopic(i, { turnBudget: e.target.value })}
                              style={{ maxWidth: 120 }}
                            />
                          </Field>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", justifyContent: "flex-end" }}>
                          <IconButton
                            variant="ghost"
                            size="sm"
                            title="Move up"
                            disabled={i === 0}
                            onClick={() => moveTopic(i, -1)}
                          >
                            <ChevronIcon size={16} style={{ transform: "rotate(180deg)" }} />
                          </IconButton>
                          <IconButton
                            variant="ghost"
                            size="sm"
                            title="Move down"
                            disabled={i === draft.topics.length - 1}
                            onClick={() => moveTopic(i, 1)}
                          >
                            <ChevronIcon size={16} />
                          </IconButton>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={<TrashIcon size={16} />}
                            disabled={draft.topics.length === 1}
                            onClick={() => removeTopic(i)}
                          >
                            Remove topic
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="ds-staff-addtopic">
                <Button
                  variant="subtle"
                  size="sm"
                  icon={<PlusIcon size={16} />}
                  onClick={() => {
                    addTopic();
                    setOpenTopic(draft.topics.length);
                  }}
                >
                  Add topic
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ds-staff-section">
        <span className="mono-label ds-staff-section__label">Sources</span>
        <Checkbox
          checked={draft.hasCollection}
          onChange={(e) => update("hasCollection", e.target.checked)}
          label="Ground replies in a library of documents"
          description="Relevant passages are added to the agent's context each turn, and the agent cites them in line so students can check the source."
        />

        {draft.hasCollection && (
          <div style={{ marginTop: "1rem" }}>
            {collections === null ? (
              <p className="muted small">Loading libraries…</p>
            ) : collections.length === 0 ? (
              <p className="muted small">
                No libraries yet.{" "}
                <Link to={`/course/${courseId}/collections`}>
                  Create one and add sources
                </Link>
                .
              </p>
            ) : (
              <>
                <span className="mono-label ds-staff-section__label">Library</span>
                <RadioCardGroup>
                  {collections.map((c) => (
                    <RadioCard
                      key={c.id}
                      name="collection"
                      value={c.id}
                      title={c.name}
                      description={`${c.sourceCount} ${c.sourceCount === 1 ? "source" : "sources"} · updated ${relativeTime(c.updatedAt)}`}
                      selected={draft.collectionId === c.id}
                      onChange={() => update("collectionId", c.id)}
                    />
                  ))}
                </RadioCardGroup>
                <p className="muted small" style={{ marginTop: "0.6rem" }}>
                  <Link to={`/course/${courseId}/collections`}>Manage libraries →</Link>
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="ds-staff-section">
        <span className="mono-label ds-staff-section__label">Model</span>
        <RadioCardGroup inline>
          {MODEL_OPTIONS.map((m) => (
            <RadioCard
              key={m.id || "default"}
              name="model"
              value={m.id}
              title={m.label}
              description={m.note}
              selected={draft.model === m.id}
              onChange={() => update("model", m.id)}
            />
          ))}
        </RadioCardGroup>
      </div>

      {saveError && <p className="error">{saveError}</p>}

      <div className="ds-staff-actions" style={{ justifyContent: "flex-end" }}>
        <Button variant="subtle" href={`/course/${courseId}/agents`}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} loading={saving} disabled={saving}>
          {isNew ? "Create agent" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
