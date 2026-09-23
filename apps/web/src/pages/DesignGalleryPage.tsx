// Design-system gallery — a standalone /design route (course-agnostic, not
// linked from any nav) that renders the live token layer and every shared
// `ds-` component on one page. It imports the real components/index.ts and the
// real tokens, so it always reflects what ships, and it renders correctly in
// both the neutral (blue) build and a branded (overlay) build via the theme
// seam — no extra wiring.
//
// This is a design surface, not a product screen: it touches no course data
// and gates nothing. Use it to review and tweak the system in isolation, then
// apply changes to the app. The section header used here (a mono kicker + a
// hairline rule) is the canonical section-header standard — see
// docs/style.md §"Section headers & dividers".

import { useState, type ReactNode } from "react";
import { input, learned, magnitude, value } from "../examples/shared/palette.js";
import "../examples/shared/figure.css";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ChatComposer,
  Checkbox,
  CitationPill,
  Divider,
  Field,
  IconButton,
  Input,
  Message,
  OutlineRail,
  PageHeader,
  RadioCard,
  RadioCardGroup,
  Section,
  Select,
  SegmentedControl,
  SourcesStrip,
  StatGrid,
  StatTile,
  SubLabel,
  Switch,
  Tag,
  Textarea,
  ThinkingDots,
  Tooltip,
  Wordmark,
} from "../components/index.js";
import {
  ArrowIcon,
  BookIcon,
  ChatIcon,
  ClockIcon,
  CopyIcon,
  GearIcon,
  HistoryIcon,
  LibraryIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  ShareIcon,
  SignOutIcon,
  SparkleIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  UsersIcon,
} from "../icons.js";

const COLOR_TOKENS: { group: string; items: { var: string; desc?: string }[] }[] = [
  {
    group: "Accent (brand seam)",
    items: [
      { var: "--accent", desc: "primary" },
      { var: "--accent-hover", desc: "hover/active" },
      { var: "--accent-ink", desc: "AA text" },
      { var: "--accent-bright", desc: "glints" },
      { var: "--accent-wash", desc: "wash" },
      { var: "--accent-wash-2", desc: "wash 2" },
    ],
  },
  {
    group: "Surfaces",
    items: [
      { var: "--bg", desc: "page" },
      { var: "--surface", desc: "cards" },
      { var: "--surface-sunken", desc: "wells" },
      { var: "--surface-hover", desc: "row hover" },
    ],
  },
  {
    group: "Text",
    items: [
      { var: "--text-strong" },
      { var: "--text-body" },
      { var: "--text-secondary" },
      { var: "--text-muted" },
      { var: "--text-faint" },
    ],
  },
  {
    group: "Borders",
    items: [
      { var: "--border" },
      { var: "--border-strong" },
      { var: "--border-faint" },
    ],
  },
  {
    group: "Status",
    items: [
      { var: "--status-success-bg", desc: "success" },
      { var: "--status-warning-bg", desc: "warning" },
      { var: "--status-info-bg", desc: "info" },
      { var: "--status-danger-bg", desc: "danger" },
    ],
  },
];

/* The three scales the example figures draw with. Rendered from the real
 * helpers in examples/shared/palette.ts, so this specimen cannot drift from
 * what a figure paints. See docs/style.md §"Figure colour in the examples". */
const FIGURE_SCALES: {
  kind: string;
  what: string;
  signed: boolean;
  fn: (t: number) => string;
  poles: { var: string; label: string }[];
  note?: string;
}[] = [
  {
    kind: "learned",
    what: "a parameter the model fitted — weight matrices, kernels",
    signed: true,
    fn: learned,
    poles: [
      { var: "--ml-learned-neg", label: "plum · negative" },
      { var: "--ml-learned-pos", label: "sage · positive" },
    ],
    note: "Reserved. Sage and plum mean “learned” and nothing else — not a series colour, not a category fill, not a status, in any example.",
  },
  {
    kind: "computed",
    what: "a number produced from this input — activations, projections, scores",
    signed: true,
    fn: value,
    poles: [
      { var: "--ml-value-neg", label: "cerulean · negative" },
      { var: "--ml-value-pos", label: "vermillion · positive" },
    ],
  },
  {
    kind: "computed, never below zero",
    what: "an attention weight, a probability — the positive arm on its own",
    signed: false,
    fn: magnitude,
    poles: [{ var: "--ml-value-pos", label: "vermillion" }],
  },
  {
    kind: "input",
    what: "the data as it arrived — pixels, raw features — and genuine edge cases",
    signed: false,
    fn: input,
    poles: [{ var: "--ml-input-ink", label: "ink" }],
  },
];

/* The voices figure text speaks in. Rendered with the real classes from
 * examples/shared/figure.css. See docs/style.md §12 "Figure text". */
const FIGURE_TEXT: { cls: string; sample: string; use: string; spec: string }[] = [
  {
    cls: "fig-label",
    sample: "hidden 1",
    use: "Names a part: a layer, lane, column, axis or stage. A name, never a sentence — four words at most.",
    spec: "mono · 10 · uppercase · 0.05em · --fig-text-label",
  },
  {
    cls: "fig-label-sub",
    sample: "relu, 25 neurons",
    use: "The quieter second line under a label: what that part is.",
    spec: "mono · 9.5 · lowercase · --fig-text-label",
  },
  {
    cls: "fig-row",
    sample: "the old way",
    use: "Only when the rows are the argument: alternatives compared side by side. Ordinary lanes take the label.",
    spec: "sans · 12 · bold · lowercase · --text-body",
  },
  {
    cls: "fig-tick",
    sample: "0   45°   90°",
    use: "A position on an axis.",
    spec: "mono · 9 · tabular · --fig-text-label",
  },
  {
    cls: "fig-word",
    sample: "pierogi",
    use: "The data's own words, exactly as written. Never uppercased.",
    spec: "mono · 11 · as written · --text-muted",
  },
  {
    cls: "fig-num",
    sample: "0.43",
    use: "A value read off the figure. Beside a scale-coloured mark it may take that scale's -ink colour.",
    spec: "mono · 10.5 · tabular · --text-body",
  },
  {
    cls: "fig-note",
    sample: "below zero, the neuron is silent",
    use: "Explains something in the figure. Sentence case; italic for a reading of a mark. Never uppercase.",
    spec: "sans · 11 · sentence case · --text-secondary",
  },
  {
    cls: "fig-word fig-on",
    sample: "pierogi",
    use: "Selected — the one treatment for “this one”, on any role. The rest dim with .fig-dim.",
    spec: "--accent · bold · others at 0.35 opacity",
  },
];

/** A small figure that uses every voice once, in place, so the roles can be
 *  seen doing their jobs rather than listed. */
function FigureTextSpecimen() {
  const words = ["a", "soggy", "pierogi", "conquered"];
  const vals = [0.12, 0.41, 0.43, 0.04];
  return (
    <svg className="dsg-figspec" viewBox="0 0 400 190" role="img" aria-label="A specimen figure using every figure text role">
      <text className="fig-label" x={12} y={30}>attention</text>
      <text className="fig-label-sub" x={12} y={43}>one head</text>
      <text className="fig-row" x={12} y={112}>the old way</text>
      <text className="fig-label-sub" x={12} y={125}>replace the word</text>
      <text className="fig-label" x={170} y={18}>weight</text>
      {words.map((w, i) => {
        const y = 36 + i * 22;
        const on = i === 2;
        return (
          <g key={w} className={on ? undefined : "fig-dim"}>
            <text className={`fig-word${on ? " fig-on" : ""}`} x={160} y={y + 4} textAnchor="end">{w}</text>
            <rect x={170} y={y - 5} width={vals[i]! * 200} height={10} rx={3} style={{ fill: "var(--ml-value-pos)" }} />
            <text className="fig-num" x={176 + vals[i]! * 200} y={y + 4}>{vals[i]!.toFixed(2)}</text>
          </g>
        );
      })}
      <line x1={170} y1={132} x2={370} y2={132} style={{ stroke: "var(--border-strong)" }} />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <text key={t} className="fig-tick" x={170 + t * 200} y={146} textAnchor="middle">{t}</text>
      ))}
      <text className="fig-note" x={170} y={172} style={{ fontStyle: "italic" }}>
        pierogi takes most from greasy and soggy
      </text>
    </svg>
  );
}

/** A vector's worth of values, fixed so the specimen never jitters. */
const SPECIMEN = [
  0.9, -0.35, 0.12, 0.67, -0.88, 0.04, 0.43, -0.6, 0.78, -0.15, 0.31, -0.71,
  0.55, 0.22, -0.44, 0.96,
];

const TYPE_SCALE: { var: string; label: string }[] = [
  { var: "--text-4xl", label: "4xl · 52" },
  { var: "--text-3xl", label: "3xl · 40" },
  { var: "--text-2xl", label: "2xl · 31" },
  { var: "--text-xl", label: "xl · 24" },
  { var: "--text-lg", label: "lg · 19" },
  { var: "--text-md", label: "md · 16" },
  { var: "--text-base", label: "base · 15" },
  { var: "--text-sm", label: "sm · 14" },
  { var: "--text-xs", label: "xs · 12" },
  { var: "--text-2xs", label: "2xs · 11" },
];

const SPACES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
const RADII = ["xs", "sm", "md", "lg", "xl", "pill"];
const SHADOWS = ["xs", "sm", "md", "lg", "xl"];

const ICONS: { name: string; node: ReactNode }[] = [
  { name: "Plus", node: <PlusIcon /> },
  { name: "Arrow", node: <ArrowIcon /> },
  { name: "Sparkle", node: <SparkleIcon /> },
  { name: "Book", node: <BookIcon /> },
  { name: "Library", node: <LibraryIcon /> },
  { name: "Chat", node: <ChatIcon /> },
  { name: "Pencil", node: <PencilIcon /> },
  { name: "User", node: <UserIcon /> },
  { name: "Users", node: <UsersIcon /> },
  { name: "Gear", node: <GearIcon /> },
  { name: "Clock", node: <ClockIcon /> },
  { name: "History", node: <HistoryIcon /> },
  { name: "Search", node: <SearchIcon /> },
  { name: "Copy", node: <CopyIcon /> },
  { name: "Share", node: <ShareIcon /> },
  { name: "Upload", node: <UploadIcon /> },
  { name: "Send", node: <SendIcon /> },
  { name: "Trash", node: <TrashIcon /> },
  { name: "SignOut", node: <SignOutIcon /> },
];

export function DesignGalleryPage() {
  const [seg, setSeg] = useState("students");
  const [model, setModel] = useState("opus");
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Wordmark />
          <span className="app-lockup__role">Design system</span>
          <span className="app-topbar__divider" aria-hidden />
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Live tokens &amp; components · themes with the active build
          </span>
        </div>
      </header>
      <div className="app__body">
        <main className="dsg">
          <span className="eyebrow">Reference</span>
          <h1>Component gallery</h1>
          <p className="dsg-lede">
            Every design token and shared component on one page, rendered from
            the same token layer and component barrel the app ships. Tweak here,
            then apply to the app — no jumping between design and code.
          </p>
          <p className="dsg-note">
            Colours come from the brand seam: this page shows the active build's
            accent (neutral editorial-blue by default; a branded deploy re-tints
            it). Neutrals, type, spacing, and radii are fixed system tokens.
          </p>

          {/* ---- Canonical section header + divider -------------------- */}
          <Section kicker="Section header & divider" meta="the standard">
            <p className="dsg-note" style={{ marginTop: 0 }}>
              The heading above — a mono uppercase kicker over a hairline rule —
              is the one canonical section header, rendered by the shared{" "}
              <b>Section</b> primitive. Every section on this page uses it. It
              replaces the ad-hoc heading styles across the app; product screens
              migrate onto it incrementally.
            </p>
          </Section>

          {/* ---- Layout primitives ------------------------------------- */}
          <Section kicker="Layout primitives" meta="new">
            <p className="dsg-note" style={{ marginTop: 0 }}>
              The shared page-composition building blocks — PageHeader, Section,
              SubLabel, Divider, and StatTile / StatGrid. Pages compose these
              instead of hand-rolling class strings, so the page-head, header,
              rule, and stat treatments stay identical everywhere.
            </p>

            <div className="dsg-sub">PageHeader — the page-title lockup</div>
            <div className="dsg-specimen">
              <PageHeader
                eyebrow="Instructor · Roster"
                title="Roster"
                scope="Everyone enrolled in this course."
                actions={<Button size="sm">Invite</Button>}
              />
            </div>

            <div className="dsg-sub">Section — kicker tier (default)</div>
            <div className="dsg-specimen">
              <Section
                kicker="Sources"
                meta="4 indexed"
                description="Documents this agent can ground its answers in."
              >
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                  Section body — the content sits below the rule.
                </p>
              </Section>
            </div>

            <div className="dsg-sub">Section — title tier (content-heavy pages)</div>
            <div className="dsg-specimen">
              <Section
                title="Course stats"
                description="A heavier sans heading over the same hairline rule."
              >
                <StatGrid>
                  <StatTile value="12" label="Agents" />
                  <StatTile value="3" label="Libraries" />
                  <StatTile value={<em>24</em>} label="Students" />
                </StatGrid>
              </Section>
            </div>

            <div className="dsg-sub">Section — control in the header slot</div>
            <div className="dsg-specimen">
              <Section kicker="Enrolled" actions={<Input placeholder="Search…" />}>
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                  A live control (search field, button) can sit in the header row.
                </p>
              </Section>
            </div>

            <div className="dsg-sub">SubLabel — a sub-heading inside a section (no rule)</div>
            <div className="dsg-specimen">
              <SubLabel>My voices</SubLabel>
              <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                Groups content within a section without adding a competing rule.
              </p>
            </div>

            <div className="dsg-sub">Divider — the one hairline (zone separator)</div>
            <div className="dsg-specimen">
              <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                Above the rule
              </p>
              <Divider />
              <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                Below the rule
              </p>
            </div>
          </Section>

          {/* ---- Color ------------------------------------------------- */}
          <Section kicker="Colour tokens">
            {COLOR_TOKENS.map((g) => (
              <div key={g.group}>
                <div className="dsg-sub">{g.group}</div>
                <div className="dsg-swatches">
                  {g.items.map((t) => (
                    <div key={t.var} className="dsg-swatch">
                      <div
                        className="dsg-swatch__chip"
                        style={{ background: `var(${t.var})` }}
                      />
                      <div className="dsg-swatch__meta">
                        <span className="dsg-swatch__name">{t.var}</span>
                        {t.desc && (
                          <span className="dsg-swatch__desc">{t.desc}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Section>

          {/* ---- Typography -------------------------------------------- */}
          <Section kicker="Typography">
            <div className="dsg-type">
              {TYPE_SCALE.map((t) => (
                <div key={t.var} className="dsg-type__row">
                  <span className="dsg-type__label">{t.label}</span>
                  <span
                    className="dsg-type__sample"
                    style={{ fontSize: `var(${t.var})` }}
                  >
                    The quick brown fox
                  </span>
                </div>
              ))}
            </div>
            <div className="dsg-sub">Faces &amp; labels</div>
            <div className="dsg-stack">
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-lg)" }}>
                Hanken Grotesk — body &amp; UI &amp; headings
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-md)" }}>
                Space Mono — wordmark, labels, code, numerals
              </span>
              <span className="eyebrow">Eyebrow — mono kicker</span>
              <span className="mono-label">mono-label — section label</span>
            </div>
          </Section>

          {/* ---- Spacing / radius / elevation -------------------------- */}
          <Section kicker="Spacing, radius & elevation">
            <div className="dsg-sub">Spacing scale (4px grid)</div>
            <div className="dsg-spaces">
              {SPACES.map((n) => (
                <div key={n} className="dsg-space__row">
                  <span className="dsg-space__name" style={{ width: "5rem" }}>
                    --space-{n}
                  </span>
                  <span
                    className="dsg-space__bar"
                    style={{ width: `var(--space-${n})` }}
                  />
                </div>
              ))}
            </div>
            <div className="dsg-sub">Radii</div>
            <div className="dsg-radii">
              {RADII.map((r) => (
                <div key={r} className="dsg-radius">
                  <span
                    className="dsg-radius__box"
                    style={{ borderRadius: `var(--radius-${r})` }}
                  />
                  <span className="dsg-radius__name">--radius-{r}</span>
                </div>
              ))}
            </div>
            <div className="dsg-sub">Elevation</div>
            <div className="dsg-shadows">
              {SHADOWS.map((s) => (
                <div key={s} className="dsg-shadow">
                  <span
                    className="dsg-shadow__box"
                    style={{ boxShadow: `var(--shadow-${s})` }}
                  />
                  <span className="dsg-shadow__name">--shadow-{s}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ---- Buttons ----------------------------------------------- */}
          <Section kicker="Buttons">
            <div className="dsg-sub">Variants</div>
            <div className="dsg-row">
              <Button variant="primary">Primary</Button>
              <Button variant="subtle">Subtle</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <div className="dsg-sub">Sizes &amp; icons</div>
            <div className="dsg-row">
              <Button size="sm" icon={<PlusIcon size={14} />}>
                Small
              </Button>
              <Button size="md" icon={<PlusIcon size={16} />}>
                Medium
              </Button>
              <Button size="lg" iconRight={<ArrowIcon size={18} />}>
                Large
              </Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="dsg-sub">Icon buttons</div>
            <div className="dsg-row">
              <IconButton variant="ghost" title="Copy">
                <CopyIcon size={18} />
              </IconButton>
              <IconButton variant="round" title="Search">
                <SearchIcon size={18} />
              </IconButton>
              <IconButton variant="primary" title="New">
                <PlusIcon size={18} />
              </IconButton>
              <Tooltip label="Delete">
                <IconButton variant="ghost" title="Delete">
                  <TrashIcon size={18} />
                </IconButton>
              </Tooltip>
            </div>
          </Section>

          {/* ---- Badges / Tags / Avatars ------------------------------- */}
          <Section kicker="Badges, tags & avatars">
            <div className="dsg-sub">Badges</div>
            <div className="dsg-row">
              <Badge tone="neutral">Neutral</Badge>
              <Badge tone="success" dot>
                Indexed
              </Badge>
              <Badge tone="warning" dot>
                Pending
              </Badge>
              <Badge tone="info">Info</Badge>
              <Badge tone="danger" dot>
                Failed
              </Badge>
              <Badge tone="brand">Brand</Badge>
              <Badge tone="ghost">Ghost</Badge>
            </div>
            <div className="dsg-sub">Tags</div>
            <div className="dsg-row">
              <Tag kind="pdf">PDF</Tag>
              <Tag kind="markdown">Markdown</Tag>
              <Tag kind="text">Text</Tag>
              <Tag kind="url">URL</Tag>
              <Tag kind="default" onRemove={() => {}}>
                Removable
              </Tag>
            </div>
            <div className="dsg-sub">Avatars</div>
            <div className="dsg-row">
              <Avatar name="Ada Lovelace" size="sm" />
              <Avatar name="Grace Hopper" />
              <Avatar name="Alan Turing" size="lg" />
              <Avatar agent name="Agent" size="lg" />
            </div>
          </Section>

          {/* ---- Cards ------------------------------------------------- */}
          <Section kicker="Cards">
            <div className="dsg-row" style={{ alignItems: "stretch" }}>
              <Card>
                <b>Default card</b>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  White paper, soft warm shadow, 16px radius.
                </p>
              </Card>
              <Card sunken>
                <b>Sunken</b>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Recessed sand surface for wells.
                </p>
              </Card>
              <Card interactive accent>
                <b>Interactive · accent</b>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Hover-lift row with an active accent rail.
                </p>
              </Card>
            </div>
          </Section>

          {/* ---- Forms ------------------------------------------------- */}
          <Section kicker="Forms & inputs">
            <div className="dsg-specimen">
              <div className="dsg-stack" style={{ maxWidth: "30rem" }}>
                <Field label="Name" hint="Shown to students.">
                  <Input placeholder="e.g. Derivatives tutor" />
                </Field>
                <Field label="Join code" >
                  <Input mono defaultValue="A1B2C3" />
                </Field>
                <Field label="Invalid" error="This field is required.">
                  <Input invalid placeholder="Something's off" />
                </Field>
                <Field label="Model">
                  <Select defaultValue="opus">
                    <option value="opus">Claude Opus</option>
                    <option value="sonnet">Claude Sonnet</option>
                    <option value="haiku">Claude Haiku</option>
                  </Select>
                </Field>
                <Field label="Notes">
                  <Textarea rows={3} placeholder="Persona, scope, style…" />
                </Field>
                <Checkbox
                  label="Ground replies in a library"
                  description="The agent answers only from the sources you choose."
                  checked={checked}
                  onChange={(e) => setChecked(e.currentTarget.checked)}
                />
                <Switch
                  label="Attendance extension"
                  checked={on}
                  onChange={(e) => setOn(e.currentTarget.checked)}
                />
              </div>
            </div>
            <div className="dsg-sub">Radio cards</div>
            <RadioCardGroup>
              <RadioCard
                title="Claude Opus"
                description="Most capable"
                name="model"
                value="opus"
                selected={model === "opus"}
                onChange={() => setModel("opus")}
              />
              <RadioCard
                title="Claude Sonnet"
                description="Balanced"
                name="model"
                value="sonnet"
                selected={model === "sonnet"}
                onChange={() => setModel("sonnet")}
              />
              <RadioCard
                title="Claude Haiku"
                description="Fastest"
                name="model"
                value="haiku"
                selected={model === "haiku"}
                onChange={() => setModel("haiku")}
              />
            </RadioCardGroup>
          </Section>

          {/* ---- Navigation -------------------------------------------- */}
          <Section kicker="Navigation">
            <div className="dsg-sub">Segmented control</div>
            <SegmentedControl
              value={seg}
              onChange={setSeg}
              options={[
                { value: "students", label: "Students", count: 24 },
                { value: "authors", label: "Authors", count: 3 },
              ]}
            />
            <div className="dsg-sub">Outline rail (backbone state)</div>
            <div className="dsg-specimen" style={{ maxWidth: "22rem" }}>
              <OutlineRail
                steps={[
                  { title: "Define a derivative", status: "done", meta: "2 turns" },
                  {
                    title: "Geometric interpretation",
                    status: "current",
                    meta: "In progress",
                  },
                  { title: "Computing from first principles", status: "upcoming" },
                  { title: "Common rules", status: "upcoming" },
                ]}
              />
            </div>
          </Section>

          {/* ---- Chat -------------------------------------------------- */}
          <Section kicker="Chat">
            <div className="dsg-specimen">
              <Message role="user">Can you walk me through the chain rule?</Message>
              <Message role="assistant">
                Sure — let's start with what you already know. What's the
                derivative of a simple power, like x³?
                <SourcesStrip
                  sources={[
                    { ordinal: 1, filename: "calculus-notes.pdf" },
                    { ordinal: 2, filename: "chain-rule.md" },
                  ]}
                />
              </Message>
              <Message role="assistant">
                Thinking <ThinkingDots />
              </Message>
              <div className="dsg-row" style={{ marginTop: "0.75rem" }}>
                <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  Inline citation:
                </span>
                <CitationPill n={1} />
                <CitationPill n={2} disabled />
              </div>
            </div>
            <div className="dsg-sub">Composer</div>
            <ChatComposer
              placeholder="Message the tutor…"
              leadIcon={<PlusIcon size={18} />}
            />
          </Section>

          {/* ---- Page-level patterns ----------------------------------- */}
          <Section kicker="Page patterns" meta="live product classes">
            <p className="dsg-note" style={{ marginTop: 0 }}>
              Composite surfaces built from the product stylesheet, shown here so
              the gallery covers page-level patterns — not just atoms.
            </p>

            <div className="dsg-sub">Empty state</div>
            <div className="dsg-specimen">
              <p className="app-empty">
                You haven’t built any agents yet.{" "}
                <a href="#agents">Make the first one</a>.
              </p>
            </div>

            <div className="dsg-sub">List rows</div>
            <div className="app-list">
              <div className="app-list__row">
                <span className="app-coll-ic" aria-hidden>
                  <BookIcon size={20} />
                </span>
                <div className="app-list__main">
                  <div className="app-list__title">Derivatives library</div>
                  <div className="app-list__sub">6 sources · updated 2 days ago</div>
                </div>
                <div className="app-list__meta">
                  <Badge tone="neutral">6</Badge>
                </div>
              </div>
              <div className="app-list__row">
                <span className="app-coll-ic" aria-hidden>
                  <BookIcon size={20} />
                </span>
                <div className="app-list__main">
                  <div className="app-list__title">Chain-rule notes</div>
                  <div className="app-list__sub">2 sources · updated today</div>
                </div>
                <div className="app-list__meta">
                  <Badge tone="neutral">2</Badge>
                </div>
              </div>
            </div>

            <div className="dsg-sub">Table</div>
            <div className="att-table">
              <div className="att-table__head">
                <span>Date</span>
                <span>Session</span>
                <span>Present</span>
                <span>Rate</span>
                <span />
              </div>
              <div className="att-table__row">
                <span className="att-table__date">Mar 14</span>
                <span className="att-table__label">Lecture 14 — Prototyping</span>
                <span className="att-table__present">28</span>
                <span className="att-table__present">93%</span>
                <span className="att-table__actions">
                  <Button variant="subtle" size="sm">
                    Open
                  </Button>
                </span>
              </div>
              <div className="att-table__row">
                <span className="att-table__date">Mar 12</span>
                <span className="att-table__label">Lecture 13 — Research</span>
                <span className="att-table__present">30</span>
                <span className="att-table__present">100%</span>
                <span className="att-table__actions">
                  <Button variant="subtle" size="sm">
                    Open
                  </Button>
                </span>
              </div>
            </div>

            <div className="dsg-sub">Join-code panel</div>
            <div className="joincode">
              <div>
                <div className="joincode__label">Join code</div>
                <div className="joincode__code">A1B2C3</div>
              </div>
              <div className="joincode__spacer" />
              <Button variant="subtle" size="sm">
                Copy code
              </Button>
              <Button variant="subtle" size="sm">
                Copy link
              </Button>
              <Button variant="danger" size="sm">
                Revoke
              </Button>
            </div>
          </Section>

          {/* ---- Icons ------------------------------------------------- */}
          <Section kicker="Icons" meta="subset">
            <div className="dsg-icons">
              {ICONS.map((ic) => (
                <div key={ic.name} className="dsg-icon">
                  {ic.node}
                  <span className="dsg-icon__name">{ic.name}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ================================================================
              Examples · Figures. Everything above is the product's system;
              this group is the extra layer the interactive examples' figures
              use, and applies nowhere else. See docs/style.md §11–12.
              ============================================================== */}
          <div className="dsg-group">
            <span className="eyebrow">Examples</span>
            <h2 className="dsg-group__title">Figures</h2>
            <p className="dsg-note">
              The rules for what goes inside an example's figure: what a colour
              means, and what voice a piece of text speaks in. They apply to the
              examples only; the product UI above never uses them.
            </p>
          </div>

          {/* ---- Figure colour ----------------------------------------- */}
          <Section kicker="Figure colour" meta="examples only">
            <p className="dsg-note">
              The interactive examples draw numbers, and a student reading three
              of them in a week should not have to relearn what a colour means.
              Every number an example draws is one of the kinds below, and each
              kind has exactly one scale. Zero is always the surface the mark
              sits on, so an empty vector reads as empty paper. The brand accent
              is <b>not</b> on this list on purpose: it belongs to the UI —
              buttons, selection, focus, “look at this one” — and it changes
              from deploy to deploy, so no datum may depend on it.
            </p>
            {FIGURE_SCALES.map((sc) => (
              <div key={sc.kind}>
                <div className="dsg-sub">{sc.kind}</div>
                <p className="dsg-scale__what">{sc.what}</p>
                <div className="dsg-scale">
                  <div className="dsg-scale__ramp">
                    {Array.from({ length: 41 }, (_, i) => {
                      const t = sc.signed ? -1 + (2 * i) / 40 : i / 40;
                      return (
                        <span
                          key={i}
                          className="dsg-scale__step"
                          style={{ background: sc.fn(t) }}
                        />
                      );
                    })}
                  </div>
                  <div className="dsg-scale__ends">
                    <span>{sc.signed ? "−1" : "0 · the surface"}</span>
                    <span>{sc.signed ? "0 · the surface" : ""}</span>
                    <span>+1</span>
                  </div>
                </div>
                <div className="dsg-scale__marks">
                  {SPECIMEN.map((v, i) => (
                    <span
                      key={`cell-${i}`}
                      className="dsg-scale__cell"
                      style={{ background: sc.fn(sc.signed ? v : Math.abs(v)) }}
                    />
                  ))}
                  {SPECIMEN.slice(0, 10).map((v, i) => (
                    <span
                      key={`node-${i}`}
                      className="dsg-scale__node"
                      style={{ background: sc.fn(sc.signed ? v : Math.abs(v)) }}
                    />
                  ))}
                </div>
                <div className="dsg-swatches dsg-swatches--poles">
                  {sc.poles.map((pole) => (
                    <div key={pole.var} className="dsg-swatch">
                      <div
                        className="dsg-swatch__chip"
                        style={{ background: `var(${pole.var})` }}
                      />
                      <div className="dsg-swatch__meta">
                        <span className="dsg-swatch__name">{pole.var}</span>
                        <span className="dsg-swatch__desc">{pole.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {sc.note && <p className="dsg-scale__note">{sc.note}</p>}
              </div>
            ))}
            <div>
              <div className="dsg-sub">category</div>
              <p className="dsg-scale__what">
                the class a point belongs to, in a classifier — a fixed order,
                not a scale
              </p>
              <div className="dsg-swatches dsg-swatches--poles">
                {[
                  { var: "--ml-class-1", label: "teal · class 1" },
                  { var: "--ml-class-2", label: "periwinkle · class 2" },
                  { var: "--ml-class-3", label: "amber · class 3" },
                ].map((c) => (
                  <div key={c.var} className="dsg-swatch">
                    <div
                      className="dsg-swatch__chip"
                      style={{ background: `var(${c.var})` }}
                    />
                    <div className="dsg-swatch__meta">
                      <span className="dsg-swatch__name">{c.var}</span>
                      <span className="dsg-swatch__desc">{c.label}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="dsg-scale__note">
                The class owns the hue; the mark says the kind. A dot is data, a
                soft fill is the true distribution, a solid line is a fit, a flat
                wash is a prediction. Always shown with the class letter too.
              </p>
            </div>
            <p className="dsg-note">
              Helpers: <code>learned()</code>, <code>value()</code>,{" "}
              <code>magnitude()</code>, <code>input()</code> and{" "}
              <code>classHue()</code> in{" "}
              <code>examples/shared/palette.ts</code>; tokens under{" "}
              <code>--ml-</code> in <code>tokens/colors.css</code>. A future
              example that is not about machine learning takes the general
              data-mark hues instead — never these.
            </p>
          </Section>


          {/* ---- Figure text ------------------------------------------- */}
          <Section kicker="Figure text" meta="examples only">
            <p className="dsg-note">
              Every piece of text in a figure does one of four jobs: it{" "}
              <b>names</b> a part of the figure, <b>marks</b> a position on it,
              carries the <b>data</b>, or <b>explains</b> something. Each job
              has one voice. Classes live in{" "}
              <code>examples/shared/figure.css</code>; each sets both{" "}
              <code>fill</code> and <code>color</code>, so the same class works
              in the SVG and in HTML laid over it.
            </p>
            <FigureTextSpecimen />
            <div className="dsg-figtext">
              {FIGURE_TEXT.map((r) => (
                <div key={r.cls} className="dsg-figtext__row">
                  <div className="dsg-figtext__sample">
                    <span className={r.cls}>{r.sample}</span>
                  </div>
                  <div className="dsg-figtext__meta">
                    <span className="dsg-swatch__name">.{r.cls}</span>
                    <span className="dsg-figtext__use">{r.use}</span>
                    <span className="dsg-figtext__spec">{r.spec}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}
