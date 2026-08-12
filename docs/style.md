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
