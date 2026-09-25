// The guided tour: a set of small puzzles on the one sandbox.
//
// Each challenge is a starting board and a few goals. Goals are checked
// against the live analysis on every change and, once met, stay met — so a
// goal like "burn out an LED" can be followed by "now light one safely"
// without the first un-ticking. A goal that needs two things true at once
// says both in one check. They can be taken in any order.

import { analyze, pinState, pinsReaching, type Analysis, type Circuit } from "./analyze.js";
import { button, led, multiplexParts, pin, pot, rails, resistor, wire } from "./circuits.js";
import { PIN_BY_ID, segGround, segLeg, type NodeId, type Part, type PinState, type Seg7 } from "./model.js";

export interface GoalContext {
  analysis: Analysis;
  circuit: Circuit;
  stats: { burned: number; toggles: number };
}

export interface Goal {
  label: string;
  check: (g: GoalContext) => boolean;
}

export interface Challenge {
  id: string;
  /** Which group it sits under in the menu. */
  group: string;
  title: string;
  /** One or two sentences. What to do, not what it proves. */
  prompt: string;
  /** Shown once every goal is met. */
  payoff?: string;
  setup: () => Part[];
  /** Pin modes to start with, by printed label. */
  pins?: Record<string, PinState>;
  goals: Goal[];
  /** Keep a short's path hidden until asked for, where finding it is the
   *  puzzle. */
  hideShortPath?: boolean;
}

// ── Checks ─────────────────────────────────────────────────────────────

const anyLit = (a: Analysis) => !a.short && a.leds.some((l) => l.status === "lit");
const variant = (g: GoalContext, patch: Partial<Circuit>) => analyze({ ...g.circuit, ...patch });

/** Lit while every button is held, dark while none is. */
const buttonWorks = (g: GoalContext) => {
  const buttons = g.circuit.parts.filter((p) => p.kind === "button").map((p) => p.id);
  if (!buttons.length) return false;
  return anyLit(variant(g, { pressed: new Set(buttons) })) && !anyLit(variant(g, { pressed: new Set() }));
};

/** Some LED's brightness follows a knob: clearly different at the two ends
 *  of its travel, and burning at neither. */
const knobDims = (g: GoalContext) =>
  g.circuit.parts.some((p) => {
    if (p.kind !== "pot") return false;
    const at = (turn: number) => variant(g, { parts: g.circuit.parts.map((q) => (q.id === p.id ? { ...p, turn } : q)) });
    const lo = at(0.08).leds;
    const hi = at(0.92).leds;
    return lo.some((l, i) => {
      const h = hi[i];
      if (!h || l.status === "burning" || h.status === "burning") return false;
      return Math.abs(l.brightness - h.brightness) > 0.3;
    });
  });

/** A button on an input pin that reads HIGH held and LOW released. */
const pinReadsButton = (g: GoalContext) => {
  const buttons = g.circuit.parts.filter((p) => p.kind === "button").map((p) => p.id);
  if (!buttons.length) return false;
  const held = variant(g, { pressed: new Set(buttons) }).readings;
  const free = variant(g, { pressed: new Set() }).readings;
  return held.some((r) => r.digital === "HIGH" && free.find((f) => f.id === r.id)?.digital === "LOW");
};

const analogBelow = (n: number) => (g: GoalContext) =>
  g.analysis.readings.some((r) => r.analog !== undefined && r.analog < n);
const analogAbove = (n: number) => (g: GoalContext) =>
  g.analysis.readings.some((r) => r.analog !== undefined && r.analog > n);

/** An LED lit by a PWM pin set somewhere in the middle. */
const pwmPart = (g: GoalContext) =>
  g.analysis.leds.some((l) => {
    if (l.status !== "lit" || !l.pin) return false;
    const s = pinState(g.circuit, l.pin);
    return s.mode === "PWM" && s.duty > 40 && s.duty < 215;
  });

/** Both displays on nine board wires: each segment has one pin, shared by
 *  the two displays, and each display's ground has a pin of its own. */
const nineWires = (g: GoalContext) => {
  const c = g.circuit;
  const disp = c.parts.filter((p): p is Seg7 => p.kind === "seg7");
  if (disp.length < 2) return false;
  const boardWires = c.parts.filter((p) => p.kind === "wire" && (PIN_BY_ID.has(p.a) || PIN_BY_ID.has(p.b))).length;
  if (boardWires > 9) return false;
  const [A, B] = disp as [Seg7, Seg7];
  const segPins = new Set<NodeId>();
  for (const s of ["a", "b", "c", "d", "e", "f", "g"] as const) {
    const pa = pinsReaching(c, segLeg(A, s));
    const pb = pinsReaching(c, segLeg(B, s));
    if (pa.length !== 1 || pb.length !== 1 || pa[0] !== pb[0]) return false;
    segPins.add(pa[0]!);
  }
  if (segPins.size !== 7) return false;
  const ga = pinsReaching(c, segGround(A)[0]);
  const gb = pinsReaching(c, segGround(B)[0]);
  return ga.length === 1 && gb.length === 1 && ga[0] !== gb[0] && !segPins.has(ga[0]!) && !segPins.has(gb[0]!);
};

/** Some segment lit on one display and nothing on the other. */
const onlyOne = (side: "left" | "right") => (g: GoalContext) => {
  const disp = g.circuit.parts.filter((p): p is Seg7 => p.kind === "seg7").sort((a, b) => a.col - b.col);
  if (disp.length < 2 || g.analysis.short) return false;
  const [on, off] = side === "left" ? [disp[0]!, disp[disp.length - 1]!] : [disp[disp.length - 1]!, disp[0]!];
  const lit = (d: Seg7) => g.analysis.leds.some((l) => l.id.startsWith(`${d.id}:`) && l.status === "lit");
  return lit(on) && !lit(off);
};

// ── The tour ───────────────────────────────────────────────────────────

export const CHALLENGES: Challenge[] = [
  {
    id: "light",
    group: "Loops",
    title: "Close the loop",
    prompt:
      "The resistor and LED are already in the board. Drag wires from hole to hole until the LED lights. Some holes are joined inside the board — X-ray shows which.",
    payoff:
      "Power leaves 3V3, runs through the resistor and the LED, and comes home to GND. Break any link and the whole loop goes dark.",
    setup: () => [...rails(), resistor("c11", "c15"), led("d15", "d16")],
    goals: [{ label: "Light the LED", check: (g) => anyLit(g.analysis) }],
  },
  {
    id: "same-strip",
    group: "Loops",
    title: "Wired up, still dark",
    prompt:
      "Every wire is in and the LED stays dark. Turn on X-ray and look at where its two legs sit. Drag a leg to move it.",
    payoff: "Both legs were in the same strip, so the power went round the LED instead of through it.",
    setup: () => [
      ...rails(),
      wire("tp11", "a11", "red"),
      resistor("c11", "c15"),
      led("b15", "d15"),
      wire("a17", "tn17", "black"),
    ],
    goals: [{ label: "Light the LED", check: (g) => anyLit(g.analysis) }],
  },
  {
    id: "resistor",
    group: "Loops",
    title: "What the resistor is for",
    prompt:
      "The LED is the load: the part the loop exists to power. The resistor keeps the current it gets small. Take the resistor out and bridge the gap with a wire.",
    payoff:
      "Without the resistor nothing in the loop limits the current, and the LED takes all of it. Where the resistor sits makes no difference: before the LED or after it, the current is the same all the way round. Select a resistor to try other values.",
    setup: () => [
      ...rails(),
      wire("tp11", "a11", "red"),
      resistor("c11", "c15"),
      led("d15", "d16"),
      wire("a16", "tn16", "black"),
    ],
    goals: [
      { label: "Burn out an LED", check: (g) => g.stats.burned > 0 },
      { label: "Put in a new LED and light it safely", check: (g) => g.stats.burned > 0 && anyLit(g.analysis) },
    ],
  },
  {
    id: "short",
    group: "Loops",
    title: "Find the short",
    prompt:
      "This board shuts off the moment it's plugged in: somewhere, 3V3 reaches GND with no load in between. It takes the long way round, but a long path is still just wire.",
    payoff:
      "Four wires and four strips, and still no load between 3V3 and GND. Length adds nothing; only a load does.",
    hideShortPath: true,
    setup: () => [
      ...rails(),
      wire("tp11", "a11", "red"),
      resistor("c11", "c15"),
      led("d15", "d16"),
      wire("a16", "tn16", "black"),
      wire("tp22", "a22", "green"),
      wire("c22", "h26", "orange"),
      wire("j26", "bn26", "blue"),
      wire("bn29", "tn29", "black"),
    ],
    goals: [{ label: "Board powered and the LED lit", check: (g) => anyLit(g.analysis) }],
  },
  {
    id: "button",
    group: "Buttons and knobs",
    title: "Add a button",
    prompt:
      "A button is a gap in the loop that closes while you hold it. Place one so the LED lights only while it's pressed, then hold it down to test.",
    payoff: "The board is only a battery here: the button closes the loop by hand, and no code is involved.",
    setup: () => [
      ...rails(),
      wire("tp11", "a11", "red"),
      resistor("c11", "c15"),
      led("c17", "c18"),
      wire("a18", "tn19", "black"),
    ],
    goals: [{ label: "The LED lights only while the button is held", check: buttonWorks }],
  },
  {
    id: "stubborn",
    group: "Buttons and knobs",
    title: "The button that's always on",
    prompt:
      "Same circuit, but this LED is lit before anyone touches the button. Turn on X-ray to see how its legs are paired inside, then select it and turn it.",
    payoff:
      "Each leg is joined to the one facing it across the button. Turned the wrong way, one of those pairs bridges the gap on its own.",
    setup: () => [
      ...rails(),
      wire("tp11", "a11", "red"),
      resistor("c11", "c15"),
      button(15, true),
      led("c17", "c18"),
      wire("a18", "tn19", "black"),
    ],
    goals: [{ label: "The LED lights only while the button is held", check: buttonWorks }],
  },
  {
    id: "dimmer",
    group: "Buttons and knobs",
    title: "A dimmer",
    prompt:
      "A potentiometer is a resistor with a third leg, the wiper, that slides along it as the knob turns. Wire it in so the knob dims the LED. Drag the knob to turn it.",
    payoff:
      "With the outer legs across 3V3 and GND, the wiper picks off any voltage in between. The resistor stays in, so even the bright end is safe. Now swap which outer leg goes to 3V3: what happens to the knob?",
    setup: () => [...rails(), pot("a", 20, 0.5), resistor("c24", "c28"), led("d28", "d29"), wire("a29", "tn29", "black")],
    goals: [{ label: "Turning the knob dims and brightens the LED", check: knobDims }],
  },
  {
    id: "pin",
    group: "Pins",
    title: "Digital out",
    prompt:
      "Now the power comes from D2, a pin set to OUTPUT. Inside the chip is a switch that code flips with digitalWrite. For now you're the code: click the D2 label on the board.",
    payoff:
      "That switch is what code flips. Next, code decides when to flip it — from a button wired into a loop of its own, so the button and the LED never touch.",
    pins: { D2: { mode: "OUTPUT", level: 0 } },
    setup: () => [
      wire(pin("GND"), "tn9", "black"),
      wire(pin("D2"), "a11", "yellow"),
      resistor("c11", "c15"),
      led("d15", "d16"),
      wire("a16", "tn16", "black"),
    ],
    goals: [
      { label: "Light the LED from D2", check: (g) => anyLit(g.analysis) },
      { label: "Blink it: switch D2 on and off three times", check: (g) => g.stats.toggles >= 6 },
    ],
  },
  {
    id: "fade",
    group: "Pins",
    title: "Analog out",
    prompt:
      "A digital pin is only ever on or off. Select D2 and switch it to PWM: it flicks on and off hundreds of times a second, and the slider sets how much of each flick is on. Get the LED to about half brightness.",
    payoff:
      "The pin never puts out 1.6 volts. It's at 3.3 V part of the time and 0 V the rest, too fast to see, so the LED looks dimmer. That's analogWrite.",
    pins: { D2: { mode: "OUTPUT", level: 1 } },
    setup: () => [
      wire(pin("GND"), "tn9", "black"),
      wire(pin("D2"), "a11", "yellow"),
      resistor("c11", "c15"),
      led("d15", "d16"),
      wire("a16", "tn16", "black"),
    ],
    goals: [{ label: "The LED glows at part brightness from a PWM pin", check: pwmPart }],
  },
  {
    id: "read-button",
    group: "Pins",
    title: "Digital in",
    prompt:
      "The button now runs from 3V3 to D19, an input. Hold it and D19 reads HIGH. Let go and D19 is connected to nothing, so it reads at random. Select D19 and find the mode that fixes that.",
    payoff:
      "INPUT_PULLDOWN ties the pin weakly to GND inside the chip, so it reads LOW until the button overpowers it. Put an LED on another pin and the button's loop and the LED's loop are separate: code is all that joins them.",
    setup: () => [wire(pin("3V3"), "tp8", "red"), wire("tp14", "a14", "red"), button(14), wire(pin("D19"), "j16", "yellow")],
    goals: [{ label: "D19 reads HIGH held and LOW released", check: pinReadsButton }],
  },
  {
    id: "read-knob",
    group: "Pins",
    title: "Analog in",
    prompt:
      "The knob's outer legs are across 3V3 and GND. Wire its middle leg to D34, one of the pins that can measure a voltage, then turn the knob and watch the reading.",
    payoff:
      "analogRead turns 0–3.3 volts into a number from 0 to 4095. The knob is now a number your code can use: to dim an LED, set a speed, anything.",
    setup: () => [...rails(), pot("a", 20, 0.5), wire("b20", "tn19", "black"), wire("b22", "tp23", "red")],
    goals: [
      { label: "Turn the knob until D34 reads under 500", check: analogBelow(500) },
      { label: "…and over 3500", check: analogAbove(3500) },
    ],
  },
  {
    id: "multiplex",
    group: "Hard",
    title: "Two displays, nine wires",
    prompt:
      "Each display is eight LEDs sharing one ground leg (X-ray names the legs). Wired separately, two displays need eighteen pins. Wire both to the board with only nine wires, then use the pins to light a segment on one display at a time.",
    payoff:
      "The displays share the seven segment wires, and each display's ground pin decides whether it listens: LOW to light, HIGH to stay dark. To show two different digits at once, code flashes between the displays faster than the eye can follow. The multiplexing sketch in the code example does exactly that.",
    setup: multiplexParts,
    goals: [
      { label: "Both displays wired to the board with nine wires", check: nineWires },
      { label: "Light a segment on the left display only", check: onlyOne("left") },
      { label: "…and on the right display only", check: onlyOne("right") },
    ],
  },
  {
    id: "free",
    group: "Free play",
    title: "Free play",
    prompt:
      "An empty board and every part. Two LEDs in series, two in parallel, a knob that fades an LED through a pin: try anything.",
    setup: () => [],
    goals: [],
  },
];

export const pinsFor = (ch: Challenge): Map<NodeId, PinState> =>
  new Map(Object.entries(ch.pins ?? {}).map(([label, s]) => [pin(label), s]));
