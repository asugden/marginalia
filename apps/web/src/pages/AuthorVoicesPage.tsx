// /author/voices — the per-author voice library (v0.7 §1.1).
//
// Three sections: the built-in "Default voices" (the shared library, incl.
// Socratic) that every course starts with, voices the signed-in user owns
// ("My voices"), and voices other authors shared with them ("Shared with me").
// Default voices are read-only; "Customize" forks one into a new owned voice
// the instructor can edit.
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
import { useCourse } from "../course/useCourse.js";
import { relativeTime } from "../time.js";
import { Avatar, Badge, Button, PageHeader, Section } from "../components/index.js";
import { PlusIcon } from "../icons.js";

export function AuthorVoicesPage() {
  // Mounted inside CourseLayout, which supplies the instructor chrome (top bar
  // + nav). Voice *data* is still per-author and cross-course; the course id
  // only scopes the URLs so the nav persists.
  const { courseId } = useCourse();
  const voicesBase = `/course/${courseId}/instructor/voices`;
  const [library, setLibrary] = useState<VoiceSummary[] | null>(null);
  const [owned, setOwned] = useState<VoiceSummary[] | null>(null);
  const [shared, setShared] = useState<SharedVoiceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    setError(null);
    listVoices()
      .then((r) => {
        setLibrary(r.library);
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
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Voices"
        title="Voices"
        scope="A voice is a persona — tone, style, pedagogy — that an agent speaks in. Voices are yours: editing one updates every new conversation against agents that use it. In-progress conversations keep the original."
        actions={
          <Button
            variant="primary"
            icon={<PlusIcon size={16} />}
            href={`${voicesBase}/new`}
          >
            New voice
          </Button>
        }
      />

        {error && <p className="error">{error}</p>}

        <Section
          kicker="Default voices"
          description="Built-in personas every course starts with — including the Socratic default. They’re read-only; Customize forks one into a new voice you own and can edit."
        >
          {library === null ? (
            <p className="muted">Loading…</p>
          ) : library.length === 0 ? (
            <p className="muted">No default voices.</p>
          ) : (
            <div className="app-list">
              {library.map((v) => (
                <div key={v.id} className="app-list__row">
                  <Avatar name={v.name} />
                  <div className="app-list__main">
                    <div className="app-list__title">
                      {v.name} <Badge tone="ghost">default</Badge>
                    </div>
                    <div className="app-list__sub">{v.description}</div>
                  </div>
                  <div className="app-list__meta">
                    <Button
                      variant="subtle"
                      size="sm"
                      disabled={busy}
                      onClick={() => onDuplicate(v.id)}
                      title="Copy this default into a new voice you own and can edit."
                    >
                      Customize
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section kicker="My voices">
          {owned === null ? (
            <p className="muted">Loading…</p>
          ) : owned.length === 0 ? (
            <p className="muted">
              No custom voices yet. Start with{" "}
              <Link to={`${voicesBase}/new`}>a new voice</Link>, or open the
              agent editor and use Customize on a library voice.
            </p>
          ) : (
            <div className="app-list">
              {owned.map((v) => (
                <div key={v.id} className="app-list__row">
                  <Avatar name={v.name} />
                  <div className="app-list__main">
                    <div className="app-list__title">
                      <Link to={`${voicesBase}/${v.id}`}>{v.name}</Link>
                    </div>
                    <div className="app-list__sub">
                      {v.description}
                      {v.updatedAt ? ` · updated ${relativeTime(v.updatedAt)}` : ""}
                    </div>
                  </div>
                  <div className="app-list__meta">
                    <Button variant="subtle" size="sm" href={`${voicesBase}/${v.id}`}>
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
        </Section>

        <Section kicker="Shared with me">
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
                      <Link to={`${voicesBase}/${v.id}`}>{v.name}</Link>{" "}
                      <Badge tone="ghost">shared</Badge>
                    </div>
                    <div className="app-list__sub">
                      {v.description}
                      {v.updatedAt ? ` · updated ${relativeTime(v.updatedAt)}` : ""}
                    </div>
                  </div>
                  <div className="app-list__meta">
                    <Button variant="subtle" size="sm" href={`${voicesBase}/${v.id}`}>
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
        </Section>
    </div>
  );
}
