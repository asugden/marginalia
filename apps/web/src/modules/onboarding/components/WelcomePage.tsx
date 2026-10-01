// /welcome — first-run setup for someone allowed to create courses.
//
// Four short screens: why the tool exists; where you stand on generative AI;
// what your students make; your course. The answers become a Preset, and
// runSetup() turns that into a configured course plus the content the tour
// points at. The tour (TourPanel) takes it from there.
//
// The stance comes first because it decides everything after it: an
// instructor who wants no generative AI is never shown an AI feature — not in
// the choices, not in the course, not in the tour.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMe } from "../../../client.js";
import {
  Button,
  Checkbox,
  Field,
  Input,
  PageHeader,
  RadioCard,
  RadioCardGroup,
  Section,
  Select,
  Wordmark,
} from "../../../components/index.js";
import {
  currentTerm,
  defaultTermDates,
  TERM_SEASONS,
  type TermSeason,
} from "../../../course/term.js";
import { ArrowIcon, BackIcon } from "../../../icons.js";
import { allowsAI } from "../presets.js";
import { DESCRIPTORS } from "../registry.js";
import { PRODUCT, runSetup } from "../setup.js";
import { whyText } from "../tour.js";
import type { FeatureId, Preset, Stance } from "../types.js";

type Screen = "why" | "stance" | "make" | "course";
const SCREENS: Screen[] = ["why", "stance", "make", "course"];

const pitchOf = (id: FeatureId) => DESCRIPTORS.find((d) => d.id === id)?.pitch(PRODUCT) ?? "";

export function WelcomePage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<Screen>("why");
  const [stance, setStance] = useState<Stance | null>(null);
  const [writing, setWriting] = useState(true);
  const [agents, setAgents] = useState(true);
  const [code, setCode] = useState(false);
  const [codeChat, setCodeChat] = useState(false);
  const [name, setName] = useState("");
  const initial = currentTerm(Date.now());
  const [season, setSeason] = useState<TermSeason | "">(initial.season);
  const [year, setYear] = useState(String(initial.year));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => !ctrl.signal.aborted && setAllowed(Boolean(m.canCreateCourses)))
      .catch(() => !ctrl.signal.aborted && setAllowed(false));
    return () => ctrl.abort();
  }, []);

  const ai = stance !== null && allowsAI(stance);
  const features: FeatureId[] = [
    ...(ai && agents ? (["agents"] as const) : []),
    ...(writing ? (["writing"] as const) : []),
    ...(code ? (["code"] as const) : []),
  ];
  const preset: Preset = { stance: stance ?? "open", features, codeChat: ai && code && codeChat };
  const idx = SCREENS.indexOf(screen);

  async function create(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim() || busy || stance === null) return;
    const y = Number(year);
    const scheduled = season !== "" && Number.isInteger(y);
    const dates = scheduled ? defaultTermDates(season as TermSeason, y) : null;
    setBusy(true);
    setError(null);
    try {
      const { firstRoute } = await runSetup({
        name: name.trim(),
        term: scheduled
          ? {
              termSeason: season as TermSeason,
              termYear: y,
              startDate: dates!.start,
              endDate: dates!.end,
            }
          : undefined,
        preset,
      });
      navigate(firstRoute);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set up the course");
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link to="/courses" aria-label="Courses" className="app-lockup-link">
            <Wordmark size="sm" />
          </Link>
          <span className="app-lockup__role">Welcome</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="app-page app-welcome">
          {allowed === false ? (
            <>
              <PageHeader eyebrow="Welcome" title="Your account can't create courses yet" />
              <p className="muted">
                Ask an admin to allow course creation for your account. If you were
                added to a course, it&rsquo;s on your <Link to="/courses">courses page</Link>.
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow app-welcome__count">
                Step {idx + 1} of {SCREENS.length}
              </p>

              {screen === "why" && (
                <>
                  <PageHeader eyebrow="Welcome" title={`What ${PRODUCT} is for`} />
                  <p className="app-welcome__lead">{whyText(PRODUCT)}</p>
                  <Section>
                    <ul className="app-welcome__list">
                      <li>
                        <b>Typing is recorded.</b> Every word is marked typed, pasted, or
                        generated — a record of sources, not a guess about authorship.
                      </li>
                      <li>
                        <b>Copying between documents is recognised</b> from keystroke timing,
                        using a method from the research literature.
                      </li>
                      <li>
                        <b>AI only if you want it.</b> When you allow it, students get chats
                        whose voice you choose, so they have a better option than whatever
                        chatbot is nearest.
                      </li>
                      <li>
                        <b>Guided and grounded.</b> You can set where a conversation goes and
                        what it draws on.
                      </li>
                    </ul>
                  </Section>
                  <p className="muted small">
                    Next we&rsquo;ll set up a real course for you — no demo course — and then
                    show you each piece from both sides: yours, and your students&rsquo;.
                  </p>
                </>
              )}

              {screen === "stance" && (
                <>
                  <PageHeader
                    eyebrow="Generative AI"
                    title="Where do you stand?"
                    scope="There's no wrong answer. This decides what we show you and what your course starts with; you can change any of it later."
                  />
                  <RadioCardGroup>
                    <RadioCard
                      name="stance"
                      value="none"
                      title="No generative AI for my students"
                      description="Just the record of where writing came from. We won't show you AI features, and your course will have none."
                      selected={stance === "none"}
                      checked={stance === "none"}
                      onChange={() => setStance("none")}
                    />
                    <RadioCard
                      name="stance"
                      value="open"
                      title="Open to it — show me"
                      description="See what AI features look like here, from your side and your students'. Nothing reaches students until you decide."
                      selected={stance === "open"}
                      checked={stance === "open"}
                      onChange={() => setStance("open")}
                    />
                    <RadioCard
                      name="stance"
                      value="learn"
                      title="Help me teach students to use AI well"
                      description="The same as above, plus how to shape the way the chat talks so it steers students toward good habits."
                      selected={stance === "learn"}
                      checked={stance === "learn"}
                      onChange={() => setStance("learn")}
                    />
                  </RadioCardGroup>
                </>
              )}

              {screen === "make" && (
                <>
                  <PageHeader
                    eyebrow="Your students"
                    title="What will students make?"
                    scope="Pick what fits. Each one becomes part of your course and a stop on the tour."
                  />
                  {/* Multi-select, so the card grid without the group's
                      radiogroup role. */}
                  <div className="ds-radiocards">
                    <RadioCard
                      name="writing"
                      value="writing"
                      type="checkbox"
                      title="Writing"
                      description={pitchOf("writing")}
                      selected={writing}
                      checked={writing}
                      onChange={() => setWriting((w) => !w)}
                    />
                    {ai && (
                      <RadioCard
                        name="agents"
                        value="agents"
                        type="checkbox"
                        title="Guided conversations"
                        description={pitchOf("agents")}
                        selected={agents}
                        checked={agents}
                        onChange={() => setAgents((a) => !a)}
                      />
                    )}
                  </div>
                  <div className="app-welcome__secondary">
                    <Checkbox
                      checked={code}
                      onChange={(e) => setCode(e.target.checked)}
                      label="My students also write code"
                      description={pitchOf("code")}
                    />
                    {ai && code && (
                      <Checkbox
                        checked={codeChat}
                        onChange={(e) => setCodeChat(e.target.checked)}
                        label="Offer a chat beside the notebook"
                        description="Off by default. You can choose per assignment later."
                      />
                    )}
                  </div>
                  {features.length === 0 && (
                    <p className="muted small">
                      Pick at least one — or we&rsquo;ll start you with Writing.
                    </p>
                  )}
                </>
              )}

              {screen === "course" && (
                <form onSubmit={create}>
                  <PageHeader
                    eyebrow="Your course"
                    title="Name your course"
                    scope="This is your real course. Students join it later with a code you share."
                  />
                  <div className="app-welcome__fields">
                    <Field label="Course name">
                      <Input
                        autoFocus
                        value={name}
                        placeholder="e.g. Writing in the Sciences"
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Field>
                    <Field label="Season">
                      <Select
                        value={season}
                        onChange={(e) => setSeason(e.target.value as TermSeason | "")}
                      >
                        <option value="">Unscheduled</option>
                        {TERM_SEASONS.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Year">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={year}
                        disabled={season === ""}
                        onChange={(e) => setYear(e.target.value)}
                      />
                    </Field>
                  </div>
                  {error && <p className="error">{error}</p>}
                  <div className="app-welcome__nav">
                    <Button
                      variant="subtle"
                      icon={<BackIcon size={16} />}
                      type="button"
                      onClick={() => setScreen("make")}
                      disabled={busy}
                    >
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      type="submit"
                      iconRight={<ArrowIcon size={16} />}
                      loading={busy}
                      disabled={busy || !name.trim()}
                    >
                      Create course and start the tour
                    </Button>
                  </div>
                </form>
              )}

              {screen !== "course" && (
                <div className="app-welcome__nav">
                  {idx > 0 ? (
                    <Button
                      variant="subtle"
                      icon={<BackIcon size={16} />}
                      onClick={() => setScreen(SCREENS[idx - 1]!)}
                    >
                      Back
                    </Button>
                  ) : (
                    <Button variant="ghost" href="/courses">
                      Skip to my courses
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    iconRight={<ArrowIcon size={16} />}
                    disabled={screen === "stance" && stance === null}
                    onClick={() => setScreen(SCREENS[idx + 1]!)}
                  >
                    Continue
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
