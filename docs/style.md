# Style — visual rules for the app

This file is the source of truth for *how the app looks and why*. The
"why" matters: most polish drift comes from making the same choice
(button colour, page background, header layout) differently in different
files because there was no written rule to point at.

Two ideas do most of the work here:

1. **Two registers, Student and Staff.** Almost every page belongs to
   one or the other. The register decides the page background, the
   button palette, and how dense the layout is allowed to get.
2. **One primary per region.** A page (or a self-contained section
   within a page) has at most one filled brand-red action. Everything
   else is subtle, neutral, or — for destructive things — a red text
   link.

Get those two right and the rest of the rules fall out.

---

## 1. Registers

### Student register

The view a student sees. Optimised for "you are reading or working in
a defined space, take your time."

- **Page background**: brand-tinted (`--bg`) with the fractured-logo
  watermark visible.
- **Content sits in a centred reading column** (~800 px,
  `.ds-home__inner` / `.app-home__inner`) on the watermarked page, inside
  the shared 1100 px frame (§8). The `Card` primitive (`.ds-card`) frames
  the individual workspace elements — agent rows, the module panels — so
  the student knows where their attention belongs. The narrower column is
  a legibility measure, not a second page width (§8).
- **Typographic emphasis**: serif display headings (`--font-display`)
  carry weight. Generous spacing. Body type at the existing 0.98 rem
  rhythm.
- **Brand red is the *primary action* colour** and appears once per
  region (Start, Continue, Send). The `subtle` Button variant is the
  secondary affordance — outline + red text on white.
- **Pages currently in this register**: the student home
  (`StudentLayout` → `StudentAgentsPage`), `JoinPage`, `ConversationPage`
  (suppresses the watermark on purpose; still student register), and the
  provenance writing surfaces.

### Staff register

The view an instructor or admin sees while running the course.
Optimised for "you are managing things; show me the data, not the
chrome."

- **Page background**: the brand-tinted page, watermark suppressed
  via the existing `.no-watermark` opt-out (extend the pattern; do
  not invent a new one).
- **No white card.** Content sits directly on the page with a
  comfortable max-width container. Loses the workspace framing on
  purpose — staff pages are dense and the card constraint fights
  table layouts.
- **Typographic emphasis**: sans for nearly everything. Serif
  reserved for the page H1 only. Tighter vertical rhythm than the
  student register.
- **Brand red appears only on the create/save primary action and on
  destructive text links.** Outline-red (`.link-button.subtle` as it
  exists today) is *demoted to neutral* in the staff register —
  staff pages have too many secondary buttons for red outlines to
  read as anything but noise.
- **Pages currently in this register**: `InstructorDashboardPage`,
  `CourseSettingsPage`, the agent + voice authoring pages
  (`AuthorListPage`, `AuthorEditPage`, `AuthorVoicesPage`,
  `AuthorVoiceEditPage`), `RosterPage`, `CollectionsListPage`,
  `CollectionDetailPage`, `AdminPage`, the `/users/:id` `UserDetailPage`,
  `CoursePickerPage`, and the attendance screens.

### How a page declares its register

Both registers share the fixed `.app` shell (a locked viewport whose
inner `.app__body` is the only thing that scrolls). The register is set
by the topbar modifier and the body container the page mounts:

- **Student**: `.app-topbar--student` over a centred reading column
  (`.ds-home__inner` / `.app-home__inner`) on the watermarked page.
- **Staff**: `.app-topbar--instructor` (or `--admin`) over a full-width
  `.app-page` (newer module screens use the equivalent `.ds-staff-page`);
  the watermark is suppressed.

A new staff page mounts `<PageHeader>` + `<Section>`s inside `.app-page`
and inherits the frame, header, and divider standards without
re-deciding them — one component per concern instead of six remembered
rules. See §8 (frame) and §9 (headers).

---

## 2. Buttons

### Taxonomy

There are exactly four button kinds. If a fifth seems necessary,
something is wrong with the page, not the rules.

| Kind | Visual | When |
|---|---|---|
| **Primary** | Filled brand red, white text | The one action this page or region exists for: Start, Send, Generate code, Create course, Save voice. **At most one per visible region.** |
| **Subtle (student)** | White fill, red text, line border | Secondary affordance in the student register: Continue (when Start is showing), Copy, Cancel, History/Author/Admin nav. |
| **Subtle (staff)** | White fill, ink-soft text, line border | Same role as student-subtle, but ink-coloured. Used across roster rows, admin tables, author lists. *Avoid red outlines on staff pages.* |
| **Danger link** | Red text only, no fill, no border | Destructive actions that need to be visibly distinct from the neutral cluster: Delete, Remove, Revoke. |

### Rules

1. **One primary per region.** A region is a card, a tab panel, or a
   top-level page section. If two things both feel primary, one of
   them isn't — promote the real one and demote the rest.
2. **Staff pages do not use the outline-red subtle button.** They use
   the ink-coloured variant. The current `.link-button.subtle`
   resolves to red on white by default; inside `.page.staff` it
   resolves to ink on white.
3. **Destructive is a link, not a button.** Filled red on "Delete"
   makes destruction look like the primary action, which it never
   is. Red text on white reads as "you can do this, but it's the
   tone-matched warning, not the call to action."
4. **Icon buttons** inherit from the same taxonomy: a filled icon
   button is primary; a ghost icon button is subtle. Tooltips via
   `title` are mandatory for icon-only buttons.

### Examples

- HomePage agent row, free-form, in progress: **Primary** Continue,
  **subtle** "+" new-chat icon button. Not two reds.
- AuthorEditPage save row: **Primary** Save, **subtle** Cancel,
  **danger link** Delete this voice (when present, bottom-aligned,
  away from the save cluster).
- RosterPage join-code row: **Primary** Generate code, then per
  existing code: **subtle** Copy code, **subtle** Copy link,
  **danger link** Revoke.
- AdminPage Promote-by-email form: **Primary** Promote, no other
  buttons in the row.

---

## 3. Header organisation

The student-register header is one row in the card. It carries the
page title (H1) on the left and a small action cluster on the right.

The action cluster has two zones separated by a thin vertical divider
(`│`), so the eye reads them as different *kinds* of action without
having to read the labels:

```
Marginalia                         History · Sign out  │  Author · Admin
```

- **Left zone** = the student's own verbs (History, Sign out).
- **Right zone** = staff destinations (Author, Admin), demoted to
  `.muted` text links rather than buttons. A student's eye doesn't
  resolve them on first scan; they're there for the same person
  when they switch hats.
- Admin only appears for instance admins (existing `isAdmin` check).
- Sign out is an icon button (door / exit-arrow) with a `title="Sign out"`.

The staff-register header is its own pattern — see §5 below.

---

## 4. Forms and inputs

The "New collection name" input is the reference. Every text input
matches it: same border (`--line`), same radius (6 px), same padding
(0.55 rem 0.7 rem), same font (0.95 rem sans), same focus treatment
(2 px brand-red outline, offset inward).

The rule lives in [styles.css](../apps/web/src/styles.css) under
`.field input[type="text"]`. No input element should style itself.

Native controls — range sliders, checkboxes, radios, progress bars —
paint themselves with the *platform's* accent unless told otherwise,
which is how a system-blue slider ends up on a warm-paper page. A base
rule in [styles.css](../apps/web/src/styles.css) gives all of them
`accent-color: var(--accent)`. A control is UI, so it takes the brand
accent whatever the deploy's accent happens to be — never a figure
colour, and never a hardcoded blue.

---

## 5. Per-user view and the Roster / Admin overlap

There is a unified per-user page at `/users/:id`. The Roster page
keeps its Students / Authors tabs (the per-course slice is still the
right one when you're running a course), and the Admin Users tab
keeps its instance-wide list — but every row in both views links into
the same `/users/:id` page.

`/users/:id` is the *primitive*; the two list views are search
affordances over it. This means:

- The "promote to instance admin" control lives on the user page,
  not on the admin list. (One place to do the thing.)
- The "change a user's role on a course" control lives on the user
  page's enrollments table, not on the roster row. (Same reason.)
- The roster and admin list rows shed their inline controls and
  become pure navigation: row + arrow.

This is staff-register territory throughout. Students never reach
`/users/:id`, never see Roster, never see Admin — staff changes live
behind authorisation gates students don't clear.

The Roster H1 and the Admin H1 each carry a one-sentence scope
header ("Everyone enrolled in *<course name>*." / "Everyone who has
signed in to this instance.") so the relationship between the two
list views and the per-user page is unmissable.

---

## 6. Cards, density, and asymmetry

The card is a student-register element. The full-bleed staff page
is a staff-register element. The asymmetry is intentional and now
documented as such; do not "unify" it in either direction without
re-opening this file.

Two heuristics for deciding which register a new page belongs to:

- *Does a student ever see this page?* If yes, student register. If
  no, staff register.
- *Is the page primarily reading/doing-one-thing, or is it
  primarily managing-a-list-of-things?* Reading → student.
  Managing → staff.

When in doubt: staff register. The white card is easy to add later
if a page turns out to want it; rescuing a staff page that
prematurely adopted the card constraint is harder.

---

## 7. What this document is not

- **Not a component library spec.** No prop tables here. The rules
  are deliberately about colour, register, and layout — the things
  that go wrong without a written rule. For a live, rendered
  reference of every token and component, open the **`/design`
  gallery** (see §10); component-level detail stays in code.
- **Not a brand guide.** The default palette is brand-neutral; a
  per-deploy theme.yaml replaces the colour values without changing
  the rules in this file. See [theming.md](theming.md).
- **Not a list of every UI fix.** This file is the rule that
  specific polish items get checked against.

---

## 8. Layout: the standard page frame

Every page shares **one** content frame so a page's body sits flush
with the nav strip above it, never inset.

- **`--shell-max` is the single width token: `1100px`.** The topbar
  inner (`.app-topbar__inner`) and every standard page container
  (`.app-page`, `.ds-staff-page`) resolve their `max-width` to it.
  Both use the same `1.5rem` horizontal gutter, so the nav strip and
  the content below it share one left/right edge.
- **Below the frame width, containers go fluid** — `width: 100%` with
  the `1.5rem` gutter — down to the phone. There is no separate
  "narrow" width; the frame just shrinks.
- **Do not hardcode a page width.** A new page uses `.app-page` (or
  `.ds-staff-page`) and inherits `--shell-max`. If you're typing a
  `max-width: NNNpx` on a page container, stop — point it at
  `var(--shell-max)`.
- **Reading measures are an inner exception, not a page width.** The
  chat thread (`--measure-chat`) and long-form prose keep a narrower
  *reading column centred inside* the 1100px frame — line length is a
  legibility constraint, distinct from the page frame. The student
  home/history are centred reading columns for the same reason. This
  is deliberate: widen the *frame*, not the *reading measure*.
- **Settled: the student topbar is the full 1100px frame while the
  student home content is the ~800px reading column.** That mismatch is
  intentional (frame vs. measure, above), not a bug to "fix" by widening
  the column or narrowing the bar. Two implementation twins still exist
  behind this — the `.app-home__inner` / `.ds-home__inner` reading
  columns and the `.app-topbar` / transitional `.ds-topbar` bars — whose
  collapse into one class each is a tracked follow-up (they touch the
  standalone-scrolling redirect/public pages), not a rule change here.

The rule exists because width drift is the most common polish bug:
before this, headers were 1100 and content 880/1020, so page bodies
looked indented from their own nav. One token removes the whole class
of mismatch.

## 9. Section headers and dividers

One canonical section header, one divider, both owned by shared
components so pages *compose* them instead of re-deciding. Before this
there were ~six heading styles and three divider treatments across
pages; that variety is the thing to delete, not preserve. The header,
divider, page-title lockup, and stat tile now live as the `<Section>`,
`<Divider>`, `<PageHeader>`, and `<StatTile>` primitives (barrelled from
`components/index.ts`, shown in the `/design` gallery).

- **Section header = a mono kicker over a hairline rule.** A short
  uppercase mono label (the `mono-label` face) sits above a
  `1px solid var(--border)` rule that spans the section. It reads as a
  quiet label, not a competing heading — sections are wayfinding, the
  page `<h1>` carries the title. This is the shared **`<Section>`**
  primitive's `kicker` prop; it renders identically in the gallery and
  on product screens.
- **One controlled second tier: `<Section title="…">`.** Content-heavy
  pages (Settings) may use a heavier sans heading in place of the mono
  kicker — but over the *same* hairline rule. One divider, two header
  weights. Reach for `title` only when a section is dense enough that a
  2xs kicker under-serves it; default to `kicker` everywhere else.
- **Sub-headings inside a section use `<SubLabel>`** — a mono label with
  no rule — so content can be grouped within a section without stacking
  a second rule.
- **Dividers use one hairline: `1px solid var(--border)`** (the
  `<Divider>` primitive, or the rule `<Section>` draws under its
  header). Not `--border-strong` (reserved for emphasized edges like the
  header action divider) and not `--border-faint` (reserved for list-row
  bottoms). A section separator is the plain `--border` hairline —
  placed under a section header, not a free-floating `<hr>`.
- **The page header lockup is the one exception with a stronger
  hierarchy:** the eyebrow → `<h1>` → scope line at the top of a page,
  the shared **`<PageHeader>`** primitive. That's the page title, not a
  section; it keeps its serif/display weight. Everything *below* it is
  sections.

## 10. The `/design` gallery

`/design` is a standalone, course-agnostic route (unlinked from any
nav) that renders the live token layer and every shared component on
one page, straight from `components/index.ts`. It reads the same tokens
and brand seam the app ships, so it themes with the active build — the
neutral default renders the editorial-blue accent; a branded deploy
re-tints it — and it never touches course data.

Use it to review or tweak the system in isolation, then apply the
change to the app. It's the living companion to this document: the
rules live here, the rendered specimens live there. Adding a new
shared component? Add it to the gallery in the same change.

---

## 11. Figure colour in the examples

The interactive examples draw numbers, and a student reading three
examples in a week should not have to relearn what a colour means.
Every number an example draws is one of three kinds, and each kind has
exactly one scale. The values are tokens in
[tokens/colors.css](../apps/web/src/tokens/colors.css) under the
`--ml-` prefix, and the drawing helpers are in
[examples/shared/palette.ts](../apps/web/src/examples/shared/palette.ts).

| Kind | What it is | Scale |
|---|---|---|
| **Learned** | A parameter the model fitted: weight matrices, kernels. | Sage `#4c7d57` positive, plum `#774879` negative. |
| **Computed** | A number produced from this input: activations, projections, scores, outputs. | Vermillion `#c13f29` positive, cerulean `#1777b8` negative. When the quantity cannot go below zero — an attention weight, a probability — use the positive arm alone, paper to vermillion. |
| **Input** | The data as it arrived: pixels, raw features. Also genuine edge cases with no sign to show. | Greyscale, paper to ink. |
| **Category** | The class a point belongs to, in a classifier. Not a number, so not a scale. | A fixed order: teal `#00879c`, periwinkle `--purple-600`, amber `--amber-600` (`--ml-class-1…3`). |

**In a classifier the class owns the hue, and the mark says what kind of
thing it is.** A classifier's parameters belong to a class (naive Bayes
fits a mean and a spread per class), so painting them sage would cost the
one thing the reader most needs: which class a curve is for. Instead
every mark takes its class's hue, and its form carries the kind, the same
way in every example:

| Mark | Kind |
|---|---|
| a dot | the data |
| a soft fill with no edge | the true distribution the data was drawn from |
| a solid line | a fit (the model's, or the reader's own, with handles) |
| a flat wash at low opacity | a prediction: which class the classifier picks there |

The hues sit clear of all four figure poles and of any red or blue
accent, and pass the colour-blind check on white (worst pair ΔE 12,
tritan 7.7). Because the tritan pair is in the floor band, a class is
never told by colour alone: it always carries its letter as well.

Three rules hold it together.

**Sage and plum mean "learned" and nothing else.** Not a series colour,
not a category fill, not a status, not a highlight — in any example,
ML or otherwise. They are the one thing a student can rely on across
the gallery, and they stop being reliable the first time they mean
something else. A non-ML example that needs distinguishable hues takes
the general data-mark palette (`--purple-600`, `--salmon-600`, the
`-600` semantic hues) instead.

**The brand accent never encodes a number.** It belongs to the UI:
buttons, selection, focus, the marker that says *look at this one*. It
also changes from deploy to deploy, which is the real argument — a
figure whose meaning depends on the accent means something different
at another institution, and on a deploy whose accent is blue the
positive and negative poles collapse into each other. Figure scales are
fixed values for that reason.

**Zero is the surface.** Every scale mixes toward the background the
mark sits on, so a zero disappears into the page and a sparse vector
reads as mostly empty. Inset figures pass their own surface as the
zero (see `palette.ts`).

**Recorded exceptions.** The convolutional network's feature maps stay
greyscale although they are computed: a feature map is an image of the
drawing as a kernel sees it, and in grey the digit's shadow carries
through every layer the way it does in the input. Its dense neurons and
output still take the computed scale. The training example's reconstruction
stays greyscale for the same reason: it is computed, but it is a picture of
the digit read side by side with the input it tries to copy. Any further exception is written
here, with its reason, or it is a bug.

Examples are migrating onto this one at a time; the attention example
is done. Until an example has had its pass it may still use the older
accent-red / slate-blue ramp, which is the thing being replaced.

---

## 12. Figure text

Figure colour (§11) says what a *mark* means. This section says what
voice a piece of *text* in a figure speaks in. Like §11 it applies to
the examples only. The classes are in
[examples/shared/figure.css](../apps/web/src/examples/shared/figure.css),
and the specimens are in `/design` under **Examples · Figures**.

Every piece of text in a figure does one of four jobs, and the job picks
the voice:

| Job | Class | Voice |
|---|---|---|
| **Names** a part: a layer, lane, column, axis or stage | `.fig-label` (`.fig-label--lg` for a large figure's main layer names) | mono · 10 · UPPERCASE · 0.05em · `--fig-text-label` |
| …and says what that part is, on a second line | `.fig-label-sub` | mono · 9.5 · lowercase · `--fig-text-label` |
| **Names** rows that are the argument (see below) | `.fig-row` | sans · 12 · bold · lowercase · `--text-body` |
| **Marks** a position on an axis | `.fig-tick` | mono · 9 · tabular · `--fig-text-label` |
| Carries the **data**: its words | `.fig-word` | mono · 11 · exactly as written · `--text-muted` |
| …the one word the figure follows, inside a label ("embedding: **pierogi**") | `.fig-word--key` (a `<tspan>`) | lowercase · bold · `--text-strong` |
| Carries the **data**: its numbers | `.fig-num` | mono · 10.5 · tabular · `--text-body`, or a scale's `-ink` colour beside a mark in that scale |
| **Explains** something | `.fig-note` | sans · 11 · sentence case · `--text-secondary`; italic for a reading of a mark |
| Selected, on any of the above | `.fig-on` (others `.fig-dim`) | `--accent` · bold; everything else at 0.35 opacity |
| Goes to another example, on any of the above | `.fig-link` (on the `<a>` / `<Link>` around the text) | the wrapped text's voice; `--accent`, underlined, on hover or focus only |

Text outside the SVG keeps the rules it already follows: a caption or
figure note under a figure is sans · xs · `--text-muted`, and so is a
legend.

Six rules hold it together.

**Uppercase names things; it never explains.** A label is a name of four
words or fewer. If it has a verb or reads as a sentence ("what the open
drawers add, summed"), it is a note: sentence case, the reading face.
Uppercase sentences are the most common violation in the gallery today.

**The data is never restyled.** A word from the sentence is shown as it
was written, in lowercase mono, even inside an uppercase label (wrap it
in `.fig-word` to reset the case).

**Rows get a title only when they are the argument.** Most rows are
lanes: "hidden 1", "E", "Q". They are parts of the figure and take
`.fig-label`, the same voice as a column header. A row title (`.fig-row`)
is for rows the reader compares as alternatives, such as "the old way" against "a
transformer" or "sigmoid" against "ReLU". There the row *is* the claim, so it is
set in the reading face, bold. Columns in the same figure stay labels.
Different voices for rows and columns are fine when that is the reason.

**One selected state.** Accent and bold, on whatever role the selected thing
has. Unselected things dim to 0.35 opacity. Do not signal selection
with dark-and-bold, with accent alone, or by changing size.

**Figure grey is `--fig-text-label`, not `--text-faint`.** Figure labels
are read from the back of a classroom, so they take the deep neural
network example's label ink (`--ink-500`, 4.8:1 on white) rather than
the UI's faint grey (2.6:1). `--text-faint` stays for the UI's
placeholders and disabled states.

**Figures draw 1:1, so a type size is a pixel size.** The sizes above
are SVG user units. They only mean pixels if the figure is not scaled.
Give every figure's `<svg>` its `width` and `height` as well as its
`viewBox`, and style it `max-width: 100%; height: auto` so it shrinks on
a narrow screen but never grows. A figure set to `width: 100%` scales
its text along with it, and two examples using the same class then
render different sizes.

A figure that genuinely needs more room than its column — the network
examples draw on a 1000-unit canvas in a ~750 px column — may shrink,
but it then declares `--fig-scale` (its width ÷ the column's, 1.33 for
those) on its `<svg>`. The figure-text classes multiply their sizes by
it, so the text still lands at the stated pixels at desktop width.

**One neuron, everywhere.** A neuron is a heavily rounded square
(corner radius about a third of its side) with a mid-grey border: the
deep neural network example's spec, named `--fig-node-border` and drawn
with `.fig-neuron` (2 px on screen). An input or output tile is the
larger square, `--fig-tile-border` and `.fig-tile` (2.25 px). Both
multiply by `--fig-scale` like the text, so a figure that shrinks keeps
its neurons' edges. A row of neurons small enough to read as dots takes
`.fig-neuron--small`. Fill is the figure scale for what the neuron holds;
the border never carries meaning, except that a neuron picked out by the
figure (fired, on the traced path) takes a darker or accent border.

**Migrating.** Examples are audited one at a time with the checklist in
[figure-audit.md](figure-audit.md), which also tracks which are done. The
activation-functions example is the first to use these classes. The older examples predate them and move over one at a time.
The old shared label class `.at-grid__axis`, once used about 50 times
for labels, headers and whole sentences alike, has been retired: each use
now carries the class for its job.

---

## 13. Words in the examples

A student reading several examples in a week should meet one name for
one idea. When the field has several names, the examples use one and
mention the others once, where the idea is introduced.

| Say | Not | Where the others are named |
|---|---|---|
| **fully connected layer** (no hyphen) | dense layer, MLP, multilayer perceptron, feed-forward layer | the deep neural network example, where the idea is introduced |
| **street** (an SVM's) | margin | the support vector machine example's lede |

Two uses of another name stay, because they are quotations. The
transformer page's reproduction of the original paper's figure keeps its
"Feed Forward" box, and that page names the paper's term once: "the
feed-forward network: two fully connected layers applied to each word on
its own". "Feed-forward" is avoided otherwise because it describes
direction, and it is true of every network without loops, convolutional
ones included. The recurrent network example's contrast is exactly
feed-forward against recurrent.

Add a row whenever a second name turns up for something the examples
already name.

---

## 14. Example panels

The examples are pages of panels. §1–§9 govern the product; this is the
panel grammar the examples share, so a student moving between them always
knows where to look.

**A panel is one `Card` (`padding="md"`) holding one idea.** From top to
bottom:

1. **Title:** an `<h2>`, `--text-lg`, `--text-strong`, sentence case, no
   full stop, margin `0 0 0.3rem`. A panel numbered on a page map (the
   transformers example) leads its title with the matching numbered chip.
2. **Standfirst:** one or two sentences, `--text-sm`, `--text-secondary`,
   line height 1.6, at most 78ch. Show, don't tell: say what to do or
   look at, not what the figure will prove.
3. **The interaction and the figure** (below).
4. **Note, if needed:** under a top rule, `--text-xs`, `--text-muted`.
   Sources, honest caveats ("designed, not learned"), and nothing the
   figure already shows.

**Subheadings** inside a panel are `<h3>`, `--text-md`, `--text-strong`,
for a second beat within the same idea. If the second beat needs its own
standfirst and figure, it is a new panel instead.

**Horizontal or vertical.**

- **Side by side** (a controls column of about 260 px on the left, the
  figure on the right, the deep neural network example's layout) when
  the figure is taller than it is wide and the reader works it
  continuously: they move a control, watch the figure, and move it again.
  The column stacks above the figure below about 860 px.
- **Stacked** (controls above, readout below, figure full width) when the
  figure is wide (a sentence, a grid across words, a table), or when the
  controls are a single row of choices.
- **One pinned bar** at the top of the page (`examples/shared/controls.css`)
  when several panels in a row follow the same choice (a sentence, a word,
  an activation). It wraps exactly those panels so it scrolls away with
  the last of them, and the panels lose their own copies of the choice.
  A page-wide switch (the activation example's Neuroscience switch) sits
  at the bar's right-hand end.

**Surfaces say what a thing is.**

| Thing | Surface |
|---|---|
| The panel | `--surface` (white card) |
| **Anything the reader operates:** the pinned bar, a controls box, a slider group | **`--surface-sunken` (the darker sand)**, `--border-strong` edge |
| A readout: a number or sentence the figure reports | `--surface` box, `--border` edge |
| A pop-up over a figure | `--surface-sunken` card, `--border-strong` edge, soft shadow |
| The figure itself | the panel's white, no box of its own unless it is inset |

**Controls.** A set of choices is a row of `Button`s, `primary` for the
chosen one and `subtle` for the rest. A `Switch` is used for a page-wide
on/off. A slider row reads label · slider · value, in mono. The one
primary per region rule (§2) holds, with the chosen button counting as
the primary.

**Readouts.** A kicker (mono, `--text-2xs`, uppercase, `--text-muted`)
over the value. A big number is mono, bold and tabular. A number that is
a figure-scale value takes that scale's `-ink` colour.
