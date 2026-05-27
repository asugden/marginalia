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
- **Content sits inside a white card** (`.card` or `.card.wide`) with
  the 12 px radius and soft shadow. The card is doing real work — it
  frames the workspace so the student knows where their attention
  belongs.
- **Typographic emphasis**: serif display headings (`--font-display`)
  carry weight. Generous spacing. Body type at the existing 0.98 rem
  rhythm.
- **Brand red is the *primary action* colour** and appears once per
  region (Start, Continue, Send). `.link-button.subtle` is the
  secondary affordance — outline + red text on white.
- **Pages currently in this register**: HomePage, JoinPage,
  ConversationPage (suppresses watermark on purpose; still student
  register), History.

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
- **Pages currently in this register**: AuthorListPage,
  AuthorEditPage, RosterPage, AdminPage, CollectionsListPage,
  CollectionDetailPage, the new `/users/:id` UserDetailPage.

### How a page declares its register

Add a top-level class to the page root:

- Student: existing classes (`.hero`, `.page`) — no change needed.
- Staff: `.page.staff` (new), which sets `.no-watermark` and the
  staff-register defaults below.

The reason for a single explicit hook (rather than per-component
choices) is so that a new staff page picks up the right defaults by
typing one class name. Nobody has to remember six rules.

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

- **Not a component library spec.** No props, no Storybook. The
  rules are deliberately about colour, register, and layout — the
  things that go wrong without a written rule. Component-level
  details stay in code.
- **Not a brand guide.** The default palette is brand-neutral; a
  per-deploy theme.yaml replaces the colour values without changing
  the rules in this file. See [theming.md](theming.md).
- **Not a list of every UI fix.** This file is the rule that
  specific polish items get checked against.
