// Panel 1: climbing Everest by feel.
//
// The traced Everest drawing. The climb opens at the fork, the ridge already
// climbed, so the first thing the reader does is choose: two ways on, alike
// until tried, and the altitude readout says which went up. Choosing up
// carries on to the top a step at a click.

import { useState } from "react";
import { Button } from "../../components/index.js";
import { FORK, ONWARD, RIDGE } from "./climb.js";
import { ALTITUDE, CLIMB_PANEL } from "./content.js";
import { Panel, Readout } from "./ui.js";

const IMG = "/examples/backpropagation/everest.svg";
// The part of the drawing the climb crosses, with some mountain around it.
const CROP = { x: 330, y: 250, w: 720, h: 830 };

/** A footstep's position: where its path starts (on the dot's edge). */
function at(d: string): { x: number; y: number } {
  const m = /^M([\d.]+),([\d.]+)/.exec(d)!;
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
}
function altitude(y: number): number {
  const t = 1 - y / 1080;
  return Math.round(ALTITUDE.bottom + t * (ALTITUDE.top - ALTITUDE.bottom));
}

type Choice = null | "up" | "down";

export function ClimbPanel() {
  const [steps, setSteps] = useState(RIDGE.length);
  const [choice, setChoice] = useState<Choice>(null);
  const [onward, setOnward] = useState(0);
  const atFork = steps >= RIDGE.length;

  // Where the climber is now, and where they were a step ago.
  const here =
    choice === "up"
      ? onward > 0
        ? at(ONWARD[onward - 1]!)
        : FORK.up
      : choice === "down"
        ? FORK.down
        : at(RIDGE[Math.min(steps, RIDGE.length) - 1]!);
  const before =
    choice === "up"
      ? onward > 1
        ? at(ONWARD[onward - 2]!)
        : onward === 1
          ? FORK.up
          : FORK.here
      : choice === "down"
        ? FORK.here
        : steps > 1
          ? at(RIDGE[steps - 2]!)
          : null;
  const alt = altitude(here.y);
  const change = before ? alt - altitude(before.y) : 0;
  const finished = choice === "up" && onward >= ONWARD.length;

  const step = () => {
    if (!atFork) setSteps((s) => s + 1);
    else if (choice === "up" && onward < ONWARD.length) setOnward((n) => n + 1);
  };
  const canStep = !atFork || (choice === "up" && !finished);

  return (
    <Panel title={CLIMB_PANEL.title} standfirst={CLIMB_PANEL.standfirst} note={CLIMB_PANEL.note}>
      <div className="bp-controls">
        <Button size="sm" variant="primary" disabled={!canStep} onClick={step}>
          {CLIMB_PANEL.step}
        </Button>
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            setSteps(RIDGE.length);
            setChoice(null);
            setOnward(0);
          }}
        >
          {CLIMB_PANEL.reset}
        </Button>
        {atFork && choice !== "up" && <span className="bp-kicker bp-controls__end">{CLIMB_PANEL.forkPrompt}</span>}
      </div>

      <div className="bp-climb">
        <svg
          className="bp-climb__fig"
          viewBox={`${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`}
          width={CROP.w * 0.62}
          height={CROP.h * 0.62}
          role="img"
          aria-label="A drawing of a mountain with the climber's footsteps leading up it."

        >
          <image href={IMG} x={0} y={0} width={1920} height={1080} />
          {RIDGE.slice(0, steps).map((d, i) => (
            <path key={`r${i}`} d={d} className="bp-climb__step" />
          ))}
          {choice === "up" && ONWARD.slice(0, onward).map((d, i) => <path key={`o${i}`} d={d} className="bp-climb__step" />)}

          {atFork && (
            <g>
              <circle cx={FORK.here.x} cy={FORK.here.y} r={FORK.r} className="bp-climb__here" />
              {!finished && (
                <>
                  <ForkOption
                    p={FORK.down}
                    kind="down"
                    chosen={choice === "down"}
                    onPick={() => setChoice("down")}
                    hidden={choice === "up"}
                  />
                  <ForkOption p={FORK.up} kind="up" chosen={choice === "up"} onPick={() => setChoice("up")} />
                </>
              )}
            </g>
          )}
        </svg>

        <Readout label={CLIMB_PANEL.altitudeLabel}>
          <span className="bp-big">{alt.toLocaleString()} m</span>
          {change !== 0 && (
            <span className={`bp-change ${change > 0 ? "bp-change--up" : "bp-change--down"}`}>
              {change > 0 ? "▲" : "▼"} {Math.abs(change)} m
            </span>
          )}
        </Readout>
      </div>
    </Panel>
  );
}

function ForkOption({
  p,
  kind,
  chosen,
  onPick,
  hidden = false,
}: {
  p: { x: number; y: number };
  kind: "up" | "down";
  chosen: boolean;
  onPick: () => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <circle
      cx={p.x}
      cy={p.y}
      r={FORK.r}
      className={`bp-climb__option bp-climb__option--${kind}${chosen ? " is-chosen" : ""}`}
      role="button"
      aria-label={kind === "up" ? "Step one way at the fork" : "Step the other way at the fork"}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
    />
  );
}
