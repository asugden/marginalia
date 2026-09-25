// The instructor header nav — the banded strip that replaced ten flat pills.
//
// WHY BANDS. The old strip rendered every visible tab as its own nowrap pill:
// ten of them, measuring ~850px against the ~1050px the topbar's inner frame
// actually has once the lockup, course switcher, role switch and sign-out take
// their share. It never fit at any window width, and because the nav could not
// shrink it pushed the role switch and sign-out off the right edge — the chrome
// that gets you OUT of a surface was the first thing to disappear.
//
// `tabs.ts` had already grouped the tabs into bands ("nine flat tabs said
// nothing about how the pieces relate"); the header was flattening them back.
// This renders the grouping instead: Dashboard · Assign · Review ▾ · Build ▾.
// Four entries, ~330px, fits with room to spare. See navGroups() for the
// composition rules and where People/Settings went.
//
// Each dropdown is a menu over its band's tabs. A band with exactly one visible
// tab renders as a plain link — opening a menu to find a single choice is worse
// than the link it hides — so a course with Attendance and Code off shows
// "Submissions" directly rather than a one-item "Review ▾".
//
// The strip also owns its overflow affordance: when it genuinely can't fit (a
// narrow window, before the ≤1180 wrap kicks in) it scrolls, and a trailing
// fade is switched on so the hidden items are SIGNALLED. Silently hidden
// navigation is the bug this whole component exists to fix; a scroll region
// with `scrollbar-width: none` and no fade is the same bug wearing a hat.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronIcon } from "../icons.js";
import {
  navGroups,
  tabHref,
  type NavGroup,
  type TabSpec,
  type TabVisibilityFlags,
} from "../course/tabs.js";

export interface CourseNavProps {
  courseId: string;
  /** Lazy-reveal flags deciding which tabs (and so which bands) are visible. */
  flags: TabVisibilityFlags | undefined;
  /** Slug of the tab matching the current URL, or null on the bare index. Used
   *  to highlight the band that CONTAINS it, not just an exact pill. */
  activeSlug: string | null;
}

export function CourseNav({ courseId, flags, activeSlug }: CourseNavProps) {
  const groups = navGroups(flags);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  // Close any open band menu on an outside click.
  useEffect(() => {
    function away(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenKey(null);
      }
    }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  // Escape closes the menu and returns focus to the strip, so keyboard callers
  // are never stranded inside an open dropdown.
  useEffect(() => {
    if (openKey == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenKey(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openKey]);

  // Only fade the trailing edge when the strip is REALLY overflowing — a nav
  // that fits should keep a hard edge rather than a permanent decorative fade.
  const measure = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setOverflowing(el.scrollWidth - el.clientWidth > 1);
  }, []);

  useEffect(() => {
    measure();
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    // Observe the nav itself: it changes size both when the window resizes and
    // when the ≤1180 rule re-flows it onto its own row.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, groups.length]);

  return (
    <div
      className={"app-navwrap" + (overflowing ? " app-navwrap--fade" : "")}
      ref={wrapRef}
    >
      <nav
        className="app-nav"
        aria-label="Course sections"
        ref={navRef}
        onScroll={measure}
      >
        {groups.map((g) =>
          g.items.length === 1 ? (
            <NavLinkItem
              key={g.key}
              courseId={courseId}
              tab={g.items[0]!}
              active={activeSlug === g.items[0]!.slug}
            />
          ) : (
            <NavBandMenu
              key={g.key}
              courseId={courseId}
              group={g}
              activeSlug={activeSlug}
              open={openKey === g.key}
              onToggle={() =>
                setOpenKey((k) => (k === g.key ? null : g.key))
              }
              onPick={() => setOpenKey(null)}
            />
          ),
        )}
      </nav>
    </div>
  );
}

/** A band that resolved to a single destination — a plain link. */
function NavLinkItem({
  courseId,
  tab,
  active,
}: {
  courseId: string;
  tab: TabSpec;
  active: boolean;
}) {
  return (
    <Link
      to={tabHref(tab, courseId)}
      className={"app-nav__item" + (active ? " app-nav__item--active" : "")}
    >
      {tab.label}
    </Link>
  );
}

/** A band with several tabs — a labelled trigger over a menu of its members.
 *  The trigger reads active when ANY member tab is the current surface, so the
 *  strip still tells you where you are even though the tab itself is inside. */
function NavBandMenu({
  courseId,
  group,
  activeSlug,
  open,
  onToggle,
  onPick,
}: {
  courseId: string;
  group: NavGroup;
  activeSlug: string | null;
  open: boolean;
  onToggle: () => void;
  onPick: () => void;
}) {
  const navigate = useNavigate();
  const containsActive = group.items.some((t) => t.slug === activeSlug);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);

  // The menu is position:FIXED, not absolute, and anchored to the trigger's
  // measured rect. It has to be: .app-nav carries `overflow-x: auto` (it is the
  // strip that scrolls when it can't fit), and an absolutely-positioned child
  // is clipped by any ancestor whose overflow isn't `visible` — so an absolute
  // menu rendered correctly but was invisible, sheared off at the ~44px nav
  // box. Fixed positioning escapes the scroll container entirely.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      // Keep the menu on-screen: it opens left-aligned to the trigger, but a
      // band near the right edge flips to right-aligned rather than overflowing.
      const width = Math.min(360, window.innerWidth - 24);
      const left = Math.min(b.left, window.innerWidth - 12 - width);
      setRect({ top: b.bottom + 6, left: Math.max(12, left) });
    }
    place();
    // Reposition rather than trail the trigger when the strip scrolls or the
    // window resizes underneath an open menu.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div className="app-navband">
      <button
        type="button"
        ref={btnRef}
        className={
          "app-nav__item app-nav__item--band" +
          (containsActive ? " app-nav__item--active" : "")
        }
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        {group.label}
        <ChevronIcon size={13} />
      </button>
      {open && rect && (
        <div
          className="app-navband__menu"
          role="menu"
          style={{ top: rect.top, left: rect.left }}
        >
          {group.items.map((t) => (
            <button
              key={t.slug}
              type="button"
              role="menuitem"
              className={
                "app-navband__opt" +
                (t.slug === activeSlug ? " app-navband__opt--active" : "")
              }
              onClick={() => {
                onPick();
                navigate(tabHref(t, courseId));
              }}
            >
              <b>{t.label}</b>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
