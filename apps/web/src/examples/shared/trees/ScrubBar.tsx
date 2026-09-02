// The control both ensemble pages are driven from.
//
// One row: the scrubber filling the middle and the current scores at the right.
// The bar is sticky, so it stays with you as you scroll down into the per-tree
// detail — which is why there is no show/hide control here. The detail is
// always on screen and the scrubber is always reachable.

export interface ScrubBarProps {
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
