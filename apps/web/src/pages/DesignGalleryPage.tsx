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
        </main>
      </div>
    </div>
  );
}
