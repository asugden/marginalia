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
import { Avatar, Badge, Button, Wordmark } from "../components/index.js";
import { PlusIcon } from "../icons.js";

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
    <div className="ds-staff">
      <header className="ds-staff-top">
        <Link to="/" aria-label="Home">
          <Wordmark size="sm" />
        </Link>
        <span className="ds-staff-top__role">Instructor</span>
        <div className="ds-staff-top__course">
          <Button variant="ghost" size="sm" href="/courses">
            ← Courses
          </Button>
        </div>
      </header>

      <div className="app-page">
        <div className="app-page__head">
          <div>
            <span className="eyebrow">Instructor · Voices</span>
            <h1>Voices</h1>
            <div className="app-page__scope">
              A voice is a persona — tone, style, pedagogy — that an agent
              speaks in. Voices are yours: editing one updates every new
              conversation against agents that use it. In-progress
              conversations keep the original.
            </div>
          </div>
          <div className="app-page__actions">
            <Button
              variant="primary"
              icon={<PlusIcon size={16} />}
              href="/author/voices/new"
            >
              New voice
            </Button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="app-section">
          <span className="mono-label app-section__label">My voices</span>
          {owned === null ? (
            <p className="muted">Loading…</p>
          ) : owned.length === 0 ? (
            <p className="muted">
              No custom voices yet. Start with{" "}
              <Link to="/author/voices/new">a new voice</Link>, or open the
              agent editor and use Customize on a library voice.
            </p>
          ) : (
            <div className="app-list">
              {owned.map((v) => (
                <div key={v.id} className="app-list__row">
                  <Avatar name={v.name} />
                  <div className="app-list__main">
                    <div className="app-list__title">
                      <Link to={`/author/voices/${v.id}`}>{v.name}</Link>
                    </div>
                    <div className="app-list__sub">
                      {v.description}
                      {v.updatedAt ? ` · updated ${relativeTime(v.updatedAt)}` : ""}
                    </div>
                  </div>
                  <div className="app-list__meta">
                    <Button variant="subtle" size="sm" href={`/author/voices/${v.id}`}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onDuplicate(v.id)}
                    >
                      Duplicate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-section">
          <span className="mono-label app-section__label">
            Shared with me
          </span>
          {shared === null ? (
            <p className="muted">Loading…</p>
          ) : shared.length === 0 ? (
            <p className="muted">
              No one has shared a voice with you. When an owner shares a voice
              with your email, it shows up here and becomes pickable in the
              agent editor.
            </p>
          ) : (
            <div className="app-list">
              {shared.map((v) => (
                <div key={v.id} className="app-list__row">
                  <Avatar name={v.name} />
                  <div className="app-list__main">
                    <div className="app-list__title">
                      <Link to={`/author/voices/${v.id}`}>{v.name}</Link>{" "}
                      <Badge tone="ghost">shared</Badge>
                    </div>
                    <div className="app-list__sub">
                      {v.description}
                      {v.updatedAt ? ` · updated ${relativeTime(v.updatedAt)}` : ""}
                    </div>
                  </div>
                  <div className="app-list__meta">
                    <Button variant="subtle" size="sm" href={`/author/voices/${v.id}`}>
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onDuplicate(v.id)}
                      title="Copy this voice into a new one you own (and can edit)."
                    >
                      Duplicate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
