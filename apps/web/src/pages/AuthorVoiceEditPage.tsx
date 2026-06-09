// /author/voices/new and /author/voices/:id — voice editor (v0.7 §1.1).
//
// Three concerns coexist on this page:
//   1. The form: name + description + system prompt fragment.
//   2. The preview: one-turn chat against a fixed scratch question so
//      the author can feel the voice before saving. Hard-coded prompt
//      set (per v0.7-plan §1.5 open question — predictable cost).
//   3. The sharing tab: owner-only, list current shares + add by email +
//      revoke.
//
// Permissions, mirrored from the worker:
//   - Owned voices: full edit/delete/share.
//   - Library voices (when opened via Customize): read-only view + a
//     prominent "Customize" button that duplicates into a new owned
//     voice and navigates there.
//   - Shared-with voices: read-only view + Duplicate button.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createVoice,
  createVoiceShare,
  deleteVoice,
  deleteVoiceShare,
  duplicateVoice,
  getVoice,
  listVoiceShares,
  previewVoice,
  updateVoice,
  type VoiceFull,
  type VoiceShareEntry,
} from "../client.js";
import { relativeTime } from "../time.js";
import {
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  Message,
  Select,
  Textarea,
  Wordmark,
} from "../components/index.js";
import { SparkleIcon } from "../icons.js";

const PREVIEW_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "derivative", label: "Explain a derivative" },
  { key: "photosynthesis", label: "Explain photosynthesis" },
  { key: "metaphor", label: "Explain a metaphor" },
];

interface Draft {
  name: string;
  description: string;
  systemPromptFragment: string;
}

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  systemPromptFragment: "",
});

export function AuthorVoiceEditPage() {
  const navigate = useNavigate();
  const { id: voiceId } = useParams<{ id: string }>();
  const isNew = !voiceId;

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loaded, setLoaded] = useState<VoiceFull | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [previewKey, setPreviewKey] = useState(PREVIEW_OPTIONS[0]!.key);
  const [previewReply, setPreviewReply] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [shares, setShares] = useState<VoiceShareEntry[] | null>(null);
  const [shareDraft, setShareDraft] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !voiceId) return;
    getVoice(voiceId)
      .then((r) => {
        setLoaded(r);
        setDraft({
          name: r.voice.name,
          description: r.voice.description,
          systemPromptFragment: r.voice.systemPromptFragment,
        });
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [voiceId, isNew]);

  const isLibrary = loaded?.kind === "library";
  const isOwner = loaded?.kind === "custom" && loaded.voice.isOwner;
  const isReadOnly = !isNew && !isOwner;

  useEffect(() => {
    if (!isOwner || !voiceId) return;
    listVoiceShares(voiceId)
      .then((r) => setShares(r.shares))
      .catch(() => setShares([]));
  }, [voiceId, isOwner]);

  async function save() {
    setSaveError(null);
    if (!draft.name.trim()) return setSaveError("Name is required");
    if (!draft.description.trim()) return setSaveError("Description is required");
    if (!draft.systemPromptFragment.trim())
      return setSaveError("System prompt fragment is required");
    setSaving(true);
    try {
      if (isNew) {
        await createVoice(draft);
      } else if (voiceId) {
        await updateVoice(voiceId, draft);
      }
      navigate("/author/voices");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!voiceId) return;
    if (!window.confirm(`Delete voice "${draft.name}"?`)) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await deleteVoice(voiceId);
      navigate("/author/voices");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  async function onPreview() {
    setPreviewBusy(true);
    setPreviewError(null);
    setPreviewReply(null);
    try {
      const r = await previewVoice({
        systemPromptFragment: draft.systemPromptFragment,
        promptKey: previewKey,
      });
      setPreviewReply(r.reply);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function onCustomize() {
    if (!voiceId) return;
    try {
      const r = await duplicateVoice(voiceId);
      navigate(`/author/voices/${r.id}`);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Customize failed");
    }
  }

  async function onAddShare(e: React.FormEvent) {
    e.preventDefault();
    if (!voiceId || !shareDraft.trim()) return;
    setShareBusy(true);
    setShareError(null);
    try {
      await createVoiceShare(voiceId, shareDraft.trim().toLowerCase());
      setShareDraft("");
      const r = await listVoiceShares(voiceId);
      setShares(r.shares);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Share failed");
    } finally {
      setShareBusy(false);
    }
  }
  async function onRevokeShare(userId: string, email: string) {
    if (!voiceId) return;
    if (!window.confirm(`Revoke sharing with ${email}?`)) return;
    setShareBusy(true);
    setShareError(null);
    try {
      await deleteVoiceShare(voiceId, userId);
      const r = await listVoiceShares(voiceId);
      setShares(r.shares);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setShareBusy(false);
    }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="ds-staff">
      <header className="ds-staff-top">
        <Link to="/" aria-label="Home">
          <Wordmark size="sm" />
        </Link>
        <span className="ds-staff-top__role">Author</span>
        <div className="ds-staff-top__course">
          <Button variant="ghost" size="sm" href="/author/voices">
            ← All voices
          </Button>
        </div>
      </header>
      <div className="ds-staff-page">{children}</div>
    </div>
  );

  if (loading) {
    return (
      <Shell>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }

  const actions = isLibrary ? (
    <Button variant="primary" onClick={onCustomize}>
      Customize
    </Button>
  ) : isReadOnly ? (
    <Button variant="primary" onClick={onCustomize}>
      Duplicate to my voices
    </Button>
  ) : (
    <>
      {!isNew && (
        <Button
          variant="danger"
          disabled={saving || deleting}
          loading={deleting}
          onClick={onDelete}
        >
          Delete
        </Button>
      )}
      <Button
        variant="primary"
        onClick={save}
        disabled={saving || deleting}
        loading={saving}
      >
        {isNew ? "Create voice" : "Save changes"}
      </Button>
    </>
  );

  return (
    <Shell>
      <div className="ds-staff-head">
        <div>
          <span className="eyebrow">Author · Voice</span>
          <h1>
            {isNew ? "New voice" : isLibrary ? "Library voice" : draft.name || "Edit voice"}
          </h1>
          {isLibrary && (
            <div className="ds-staff-head__scope">
              Library voices are read-only. Use Customize to fork this into a new
              voice you own — you can then edit, share, and use it the same way
              as any of your own voices.
            </div>
          )}
          {isReadOnly && !isLibrary && (
            <div className="ds-staff-head__scope">
              This voice is shared with you by another author. You can use it in
              your agents, but you can&rsquo;t edit or delete it. Use Duplicate
              to fork it into a new voice you own.
            </div>
          )}
        </div>
        <div className="ds-staff-actions">{actions}</div>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      <div className="ds-staff-section ds-staff-row">
        <Field label="Name">
          <Input
            type="text"
            value={draft.name}
            disabled={isReadOnly}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Description" hint="One line shown in the agent picker.">
          <Input
            type="text"
            value={draft.description}
            disabled={isReadOnly}
            placeholder="One line shown in the agent picker."
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
      </div>

      <div className="ds-staff-section">
        <Field
          label="System prompt fragment"
          hint="Describe persona, tone, and method. Keep topic content out — that lives in agent backbones."
        >
          <Textarea
            rows={10}
            value={draft.systemPromptFragment}
            disabled={isReadOnly}
            className="ds-input--mono"
            placeholder="Describe persona, tone, and method."
            onChange={(e) =>
              setDraft({ ...draft, systemPromptFragment: e.target.value })
            }
          />
        </Field>
      </div>

      <div className="ds-staff-section">
        <span className="mono-label ds-staff-section__label">Preview</span>
        <p className="muted small">
          One-turn preview against a fixed question. Lets you feel the voice
          before saving an agent against it.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginTop: "0.5rem" }}>
          <div style={{ maxWidth: "18rem", flex: 1 }}>
            <Select
              value={previewKey}
              disabled={previewBusy}
              onChange={(e) => setPreviewKey(e.target.value)}
            >
              {PREVIEW_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="subtle"
            icon={<SparkleIcon size={16} />}
            onClick={onPreview}
            loading={previewBusy}
            disabled={previewBusy || !draft.systemPromptFragment.trim()}
          >
            Try this voice
          </Button>
        </div>
        {previewError && <p className="error">{previewError}</p>}
        {previewReply !== null && (
          <div style={{ marginTop: "1rem" }}>
            <Message role="assistant" roleLabel={draft.name || "Voice"}>
              {previewReply}
            </Message>
          </div>
        )}
      </div>

      {!isNew && isOwner && (
        <div className="ds-staff-section">
          <span className="mono-label ds-staff-section__label">Sharing</span>
          <p className="muted small">
            Share this voice with another author by email. They can use it in
            their own agents but can&rsquo;t edit or delete it. You can revoke at
            any time; revoking doesn&rsquo;t affect agents they&rsquo;ve already
            saved against this voice (those keep working until the voice itself
            is deleted).
          </p>
          {shareError && <p className="error">{shareError}</p>}
          <form
            onSubmit={onAddShare}
            style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", margin: "1rem 0" }}
          >
            <div style={{ flex: 1, maxWidth: "24rem" }}>
              <Field label="Share with email">
                <Input
                  type="email"
                  placeholder="someone@example.edu"
                  value={shareDraft}
                  disabled={shareBusy}
                  onChange={(e) => setShareDraft(e.target.value)}
                />
              </Field>
            </div>
            <Button
              type="submit"
              variant="primary"
              loading={shareBusy}
              disabled={shareBusy || !shareDraft.trim()}
            >
              Share
            </Button>
          </form>
          {shares === null ? (
            <p className="muted">Loading…</p>
          ) : shares.length === 0 ? (
            <p className="muted">Not shared with anyone yet.</p>
          ) : (
            <div className="ds-roster">
              {shares.map((s) => (
                <div className="ds-roster__row" key={s.userId}>
                  <div className="ds-roster__person">
                    <Avatar name={s.displayName || s.email} />
                    <div style={{ minWidth: 0 }}>
                      <div className="ds-roster__name">
                        {s.displayName || s.email}
                      </div>
                      <div className="ds-roster__email">{s.email}</div>
                    </div>
                  </div>
                  <span className="ds-roster__meta">
                    Shared {relativeTime(s.createdAt)}
                  </span>
                  <div className="ds-roster__actions">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={shareBusy}
                      onClick={() => onRevokeShare(s.userId, s.email)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {saveError && <p className="error">{saveError}</p>}

      <div className="ds-staff-actions" style={{ justifyContent: "flex-end" }}>
        <Button variant="subtle" href="/author/voices">
          Cancel
        </Button>
        {actions}
      </div>
    </Shell>
  );
}
