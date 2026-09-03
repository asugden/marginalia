// The control both ensemble pages are driven from.
//
// One row: an optional control at the left-hand end, the scrubber filling the
// middle, and the current scores at the right. The bar is sticky, so anything
// in that leading slot stays reachable however far down the page you scroll —
// which is why the choice of task lives there rather than buried in the
// controls panel halfway down.

export interface ScrubBarProps {
  /** Rendered at the left-hand end, ahead of the counter. For a control that
   *  changes what the whole page is showing, rather than one that tunes it. */
  leading?: React.ReactNode;
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** Headline score, e.g. "train 2.96 kg" or "87% correct". */
  primary: string;
  /** Second line, usually the test score. */
  secondary: string;
}

/** A fast drag along the scrubber otherwise sweeps a text selection across
 *  everything it passes over. Suppress selection for the length of the drag.
 *  The release is listened for on the window, not the input, because a drag
 *  that ends off the control never fires the control's own pointerup. */
function beginScrub() {
  document.body.classList.add("is-scrubbing");
  const end = () => {
    document.body.classList.remove("is-scrubbing");
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

export function ScrubBar({
  leading,
  id,
  label,
  value,
  min,
  max,
  onChange,
  primary,
  secondary,
}: ScrubBarProps) {
  return (
    <div className="ens-scrub">
      {leading && <div className="ens-scrub__leading">{leading}</div>}
      <label className="ens-scrub__label" htmlFor={id}>
        {label}
        <b>{value}</b>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={beginScrub}
      />
      <span className="ens-scrub__score">
        {primary}
        <em>{secondary}</em>
      </span>
    </div>
  );
}
