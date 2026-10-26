# Code panel (shared)

An optional, per-example code view: a **Code** switch at the upper right of
an example's own heading (never the site topbar), an optional version
dropdown beside it, and a popover that shows one code box at a time,
opened by pointing at the part of the figure it builds (click to pin).

- `types.ts` — `CodeVersion` / `CodeSection`, the shape of an example's
  code content.
- `useCodeView.ts` — on/off (always starts off, not remembered) and the
  version pick (per example, remembered in this browser only).
- `CodeToggle.tsx` — the DS `Switch` and, for several versions, the DS
  `Dropdown` (never the native `Select`).
- `CodePopover.tsx` — the one open box (with a pager when several share a
  part), closed by Escape, its button, or a press outside;
  `regionsLitBy(section)` gives the parts to keep lit while it is open.
- `highlight.tsx` — a small Python highlighter and the prose renderer
  (`backticks` → code, `*term*` → emphasis, blank line → paragraph,
  `1.` / `-` lines → one tight list).

## Adding code to an example

1. Write a content file next to the example (see
   `../../mnist-mlp/code.ts`): one or more `CodeVersion`s, each a list of
   sections with `code`, `explain`, and the `over` regions they build.
2. Name the regions in the example's figure and give each a transparent
   hover target (enter → open, leave → close after a short grace, click →
   pin). While code is on, let the figure's marks pass the pointer through
   to those targets and switch off the figure's own hover explanations, so
   every part is exactly one control. Shade and keep full strength what
   `regionsLitBy(openSection)` names; dim the rest.
3. Put `<CodeToggle>` at the right of the heading's eyebrow row. Render
   `<CodePopover>` inside the figure's positioned wrapper, beside the
   part it explains, and a row of quiet ghost buttons (`.ex-chips`) for
   sections with no `over`.

Styling follows docs/style.md §14: the switch is the DS `Switch`, the
popover is a sunken (dark sand) card with a strong border and soft shadow,
and the accent appears nowhere: not on the figure, the card, or the
buttons.

Give each part of the figure one section. The popover can page between
several, but readers miss its small arrow; put extra sections in the
bottom row (`over: []`) instead.

Code is off by default and the page must read completely without it.
Turning it on must not move anything: no added text, and the switch sits
out of the flow. Don't add a box that assembles the whole program; the
reader finds the pieces.
