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

  if (loading) {
    return (
      <div className="page staff">
        <div className="staff-frame">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page staff">
      <div className="staff-frame">
        <header className="card-header">
          <h1>{isNew ? "New voice" : isLibrary ? "Library voice" : "Edit voice"}</h1>
          <div className="header-actions">
            <Link to="/author/voices" className="link-button subtle">
              ← All voices
            </Link>
          </div>
        </header>
        {isLibrary && (
          <p className="scope-note">
            Library voices are read-only. Use Customize to fork this into a
            new voice you own — you can then edit, share, and use it the
            same way as any of your own voices.
          </p>
        )}
        {isReadOnly && !isLibrary && (
          <p className="scope-note">
            This voice is shared with you by another author. You can use
            it in your agents, but you can't edit or delete it. Use
            Duplicate to fork it into a new voice you own.
          </p>
        )}

        {loadError && <p className="error">{loadError}</p>}

        <label className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            value={draft.name}
            disabled={isReadOnly}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Description</span>
          <input
            type="text"
            value={draft.description}
            disabled={isReadOnly}
            placeholder="One line shown in the agent picker."
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">System prompt fragment</span>
          <textarea
            rows={10}
            value={draft.systemPromptFragment}
            disabled={isReadOnly}
            placeholder="Describe persona, tone, and method. Keep topic content out — that lives in agent backbones."
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
            onChange={(e) =>
              setDraft({ ...draft, systemPromptFragment: e.target.value })
            }
          />
        </label>

        <section className="field-group">
          <h2>Preview</h2>
          <p className="muted small">
            One-turn preview against a fixed question. Lets you feel the
            voice before saving an agent against it.
          </p>
          <div className="inline-form">
            <select
              value={previewKey}
              disabled={previewBusy}
              onChange={(e) => setPreviewKey(e.target.value)}
            >
              {PREVIEW_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onPreview}
              disabled={previewBusy || !draft.systemPromptFragment.trim()}
            >
              {previewBusy ? "Running…" : "Try this voice"}
            </button>
          </div>
          {previewError && <p className="error">{previewError}</p>}
          {previewReply !== null && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem 1rem",
                background: "#fff",
                border: "1px solid var(--line)",
                borderRadius: 8,
                whiteSpace: "pre-wrap",
                lineHeight: 1.55,
              }}
            >
              {previewReply}
            </div>
          )}
        </section>

        {!isNew && isOwner && (
          <section className="field-group">
            <h2>Sharing</h2>
            <p className="muted small">
              Share this voice with another author by email. They can use
              it in their own agents but can't edit or delete it. You can
              revoke at any time; revoking doesn't affect agents they've
              already saved against this voice (those keep working until
              the voice itself is deleted).
            </p>
            {shareError && <p className="error">{shareError}</p>}
            <form className="inline-form" onSubmit={onAddShare}>
              <input
                type="email"
                placeholder="someone@example.edu"
                value={shareDraft}
                disabled={shareBusy}
                onChange={(e) => setShareDraft(e.target.value)}
              />
              <button type="submit" disabled={shareBusy || !shareDraft.trim()}>
                {shareBusy ? "Sharing…" : "Share"}
              </button>
            </form>
            {shares === null ? (
              <p className="muted">Loading…</p>
            ) : shares.length === 0 ? (
              <p className="muted">Not shared with anyone yet.</p>
            ) : (
              <ul className="assignment-list">
                {shares.map((s) => (
                  <li key={s.userId}>
                    <div>
                      <strong>{s.email}</strong>
                      {s.displayName && (
                        <span className="muted small"> · {s.displayName}</span>
                      )}
                      <div className="muted small">
                        Shared {relativeTime(s.createdAt)}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="danger-link"
                        disabled={shareBusy}
                        onClick={() => onRevokeShare(s.userId, s.email)}
                      >
                        Revoke
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {saveError && <p className="error">{saveError}</p>}

        <div className="form-actions">
          <Link to="/author/voices" className="link-button subtle">
            Cancel
          </Link>
          {isLibrary ? (
            <button type="button" onClick={onCustomize}>
              Customize
            </button>
          ) : isReadOnly ? (
            <button type="button" onClick={onCustomize}>
              Duplicate to my voices
            </button>
          ) : (
            <>
              {!isNew && (
                <button
                  type="button"
                  className="danger-link"
                  disabled={saving || deleting}
                  onClick={onDelete}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
              <button onClick={save} disabled={saving || deleting}>
                {saving ? "Saving…" : isNew ? "Create voice" : "Save changes"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
