// /author/voices — the per-author voice library (v0.7 §1.1).
//
// Two sections: voices the signed-in user owns ("My voices") and voices
// other authors have shared with them ("Shared with me"). Library voices
// are not surfaced here — they live in the agent editor's voice picker,
// where a "Customize" button forks them into a new owned voice.
//
// This page is the place to author voices; editing happens at
// /author/voices/:id and /author/voices/new.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  duplicateVoice,
  listVoices,
  type SharedVoiceSummary,
  type VoiceSummary,
} from "../client.js";
import { relativeTime } from "../time.js";

export function AuthorVoicesPage() {
  const [owned, setOwned] = useState<VoiceSummary[] | null>(null);
  const [shared, setShared] = useState<SharedVoiceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    setError(null);
    listVoices()
      .then((r) => {
        setOwned(r.owned);
        setShared(r.shared);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }
  useEffect(reload, []);

  async function onDuplicate(voiceId: string) {
    setBusy(true);
    setError(null);
    try {
      await duplicateVoice(voiceId);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page staff">
      <div className="staff-frame">
        <header className="card-header">
          <h1>Voices</h1>
          <div className="header-actions">
            <Link to="/author/agents" className="link-button subtle">
              ← Agents
            </Link>
            <Link to="/author/voices/new" className="link-button">
              New voice
            </Link>
          </div>
        </header>
        <p className="scope-note">
          A voice is a persona — tone, style, pedagogy — that an agent
          speaks in. Voices are yours: editing one updates every new
          conversation against agents that use it. In-progress
          conversations keep the original.
        </p>

        {error && <p className="error">{error}</p>}

        <section className="field-group">
          <h2>My voices</h2>
          {owned === null ? (
            <p className="muted">Loading…</p>
          ) : owned.length === 0 ? (
            <p className="muted">
              No custom voices yet. Start with{" "}
              <Link to="/author/voices/new">a new voice</Link>, or open the
              agent editor and use Customize on a library voice.
            </p>
          ) : (
            <ul className="assignment-list">
              {owned.map((v) => (
                <li key={v.id}>
                  <div>
                    <Link to={`/author/voices/${v.id}`}>
                      <strong>{v.name}</strong>
                    </Link>
                    <div className="muted small">
                      {v.description}
                      {v.updatedAt && <> · updated {relativeTime(v.updatedAt)}</>}
                    </div>
                  </div>
                  <div className="row-actions">
                    <Link to={`/author/voices/${v.id}`} className="link-button subtle">
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="subtle"
                      disabled={busy}
                      onClick={() => onDuplicate(v.id)}
                    >
                      Duplicate
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="field-group">
          <h2>Shared with me</h2>
          {shared === null ? (
            <p className="muted">Loading…</p>
          ) : shared.length === 0 ? (
            <p className="muted">
              No one has shared a voice with you. When an owner shares a
              voice with your email, it shows up here and becomes pickable
              in the agent editor.
            </p>
          ) : (
            <ul className="assignment-list">
              {shared.map((v) => (
                <li key={v.id}>
                  <div>
                    <Link to={`/author/voices/${v.id}`}>
                      <strong>{v.name}</strong>
                    </Link>
                    <span className="muted small">
                      {" "}· shared
                    </span>
                    <div className="muted small">
                      {v.description}
                      {v.updatedAt && <> · updated {relativeTime(v.updatedAt)}</>}
                    </div>
                  </div>
                  <div className="row-actions">
                    <Link to={`/author/voices/${v.id}`} className="link-button subtle">
                      View
                    </Link>
                    <button
                      type="button"
                      className="subtle"
                      disabled={busy}
                      onClick={() => onDuplicate(v.id)}
                      title="Copy this voice into a new one you own (and can edit)."
                    >
                      Duplicate
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
