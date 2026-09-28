// The guided tour: a set of small puzzles on the one sandbox.
//
// Each challenge is a starting board and a few goals. Goals are checked
// against the live analysis on every change and, once met, stay met — so a
// goal like "burn out an LED" can be followed by "now light one safely"
// without the first un-ticking. A goal that needs two things true at once
// says both in one check. They can be taken in any order.

import {
  analyze,
  pinState,
  pinsReaching,
  type Analysis,
  type Circuit,
} from "./analyze.js";
import {
  button,
  led,
  multiplexParts,
  pin,
  pot,
  rails,
  resistor,
  wire,
} from "./circuits.js";
import {
  PIN_BY_ID,
  segGround,
  segLeg,
  type NodeId,
  type Part,
  type PinState,
  type Seg7,
} from "./model.js";

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

const anyLit = (a: Analysis) =>
  !a.short && a.leds.some((l) => l.status === "lit");
const variant = (g: GoalContext, patch: Partial<Circuit>) =>
  analyze({ ...g.circuit, ...patch });

/** Lit while every button is held, dark while none is. */
const buttonWorks = (g: GoalContext) => {
  const buttons = g.circuit.parts
    .filter((p) => p.kind === "button")
    .map((p) => p.id);
  if (!buttons.length) return false;
  return (
    anyLit(variant(g, { pressed: new Set(buttons) })) &&
    !anyLit(variant(g, { pressed: new Set() }))
  );
};

/** Some LED's brightness follows a knob: clearly different at the two ends
 *  of its travel, and burning at neither. */
const knobDims = (g: GoalContext) =>
  g.circuit.parts.some((p) => {
    if (p.kind !== "pot") return false;
    const at = (turn: number) =>
      variant(g, {
        parts: g.circuit.parts.map((q) => (q.id === p.id ? { ...p, turn } : q)),
      });
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
  const buttons = g.circuit.parts
    .filter((p) => p.kind === "button")
    .map((p) => p.id);
  if (!buttons.length) return false;
  const held = variant(g, { pressed: new Set(buttons) }).readings;
  const free = variant(g, { pressed: new Set() }).readings;
  return held.some(
    (r) =>
      r.digital === "HIGH" &&
      free.find((f) => f.id === r.id)?.digital === "LOW",
  );
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
  const boardWires = c.parts.filter(
    (p) => p.kind === "wire" && (PIN_BY_ID.has(p.a) || PIN_BY_ID.has(p.b)),
  ).length;
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
  const ga = pinsReaching(c, segGround(A));
  const gb = pinsReaching(c, segGround(B));
  return (
    ga.length === 1 &&
    gb.length === 1 &&
    ga[0] !== gb[0] &&
    !segPins.has(ga[0]!) &&
    !segPins.has(gb[0]!)
  );
};

/** Some segment lit on one display and nothing on the other. */
const onlyOne = (side: "left" | "right") => (g: GoalContext) => {
  const disp = g.circuit.parts
    .filter((p): p is Seg7 => p.kind === "seg7")
    .sort((a, b) => a.col - b.col);
  if (disp.length < 2 || g.analysis.short) return false;
  const [on, off] =
    side === "left"
      ? [disp[0]!, disp[disp.length - 1]!]
      : [disp[disp.length - 1]!, disp[0]!];
  const lit = (d: Seg7) =>
    g.analysis.leds.some(
      (l) => l.id.startsWith(`${d.id}:`) && l.status === "lit",
    );
  return lit(on) && !lit(off);
};

// ── The tour ───────────────────────────────────────────────────────────

export const CHALLENGES: Challenge[] = [
  {
    id: "light",
    group: "Wire Loops",
    title: "Connect an LED",
    prompt:
      "A resistor and LED have been added to the breadboard. Use the ESP32 as a power source (3v3 and GND). Drag wires between holes/pins and test out X-ray, Colorize, and Diagram.",
    payoff:
      "Power goes from 3v3, through the resistor and LED, and back to GND-- a circuit!",
    setup: () => [...rails(), resistor("c11", "c15"), led("d15", "d16")],
    goals: [{ label: "Light the LED", check: (g) => anyLit(g.analysis) }],
  },
  {
    id: "same-strip",
    group: "Wire Loops",
    title: "LED not working",
    prompt:
      "Wires connect to 3v3 and GND, but the LED is not working. Why? Try X-ray.",
    payoff:
      "Both LED legs were in the same row, so the power went past the LED.",
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
    group: "Wire Loops",
    title: "Why the resistor?",
    prompt:
      "The LED draws power, but tries to draw too much. Skip the resistor by connecting a wire across it to see what happens.",
    payoff:
      "The resistor resists or limits the current. Try other resistor values to see what happens.",
    setup: () => [
      ...rails(),
      wire("tp11", "a11", "red"),
      resistor("c11", "c15"),
      led("d15", "d16"),
      wire("a16", "tn16", "black"),
    ],
    goals: [
      { label: "Burn out an LED", check: (g) => g.stats.burned > 0 },
      {
        label: "Replace the LED and light it",
        check: (g) => g.stats.burned > 0 && anyLit(g.analysis),
      },
    ],
  },
  {
    id: "short",
    group: "Wire Loops",
    title: "Find the short",
    prompt:
      "The ESP32 shuts off when plugged in (the red light turns off). This suggests a short circuit and is worth avoiding-- 3v3 connects directly to GND.",
    payoff:
      "The key is to disconnect wires or add something that uses the power.",
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
    goals: [
      {
        label: "Light the LED with no short",
        check: (g) => anyLit(g.analysis),
      },
    ],
  },
  {
    id: "button",
    group: "Interaction",
    title: "Use a button",
    prompt:
      "A button is just two wires that can be connected or disconnected. Add a button to light the LED only when pressed (via the Hand).",
    payoff: "The board is just for power and the button acts on the circuit.",
    setup: () => [
      ...rails(),
      wire("tp11", "a11", "red"),
      resistor("c11", "c15"),
      led("c17", "c18"),
      wire("a18", "tn19", "black"),
    ],
    goals: [
      {
        label: "Light the LED when the button is pressed",
        check: buttonWorks,
      },
    ],
  },
  {
    id: "stubborn",
    group: "Buttons and knobs",
    title: "Always-on button",
    prompt:
      "This seems the same, but the LED won't turn off. Try X-ray to understand the button better.",
    payoff:
      "Buttons can be frustrating as to which legs connect. Guess-and-check or a continuity tester work.",
    setup: () => [
      ...rails(),
      wire("tp11", "a11", "red"),
      resistor("c11", "c15"),
      button(15, true),
      led("c17", "c18"),
      wire("a18", "tn19", "black"),
    ],
    goals: [
      {
        label: "Light the LED when the button is pressed",
        check: buttonWorks,
      },
    ],
  },
  {
    id: "dimmer",
    group: "Interaction",
    title: "Potentiometer",
    prompt:
      "A potentiometer is a variable resitor. Confusingly, it can be used in two ways. In this case, we want it JUST to be a variable resistor. Connect the first or third pin to one side of the circuit and the central wiper pin to the other.  Adjust the knob with the Hand.",
    payoff:
      "We can use just 2/3 pins as a variable resistor. In digital circuits, though, we usually connect the outer legs to power and ground and use the middle leg as a variable source of voltage. ",
    setup: () => [
      ...rails(),
      pot("a", 20, 0.5),
      resistor("c24", "c28"),
      led("d28", "d29"),
      wire("a29", "tn29", "black"),
    ],
    goals: [{ label: "Dim and brighten the LED", check: knobDims }],
  },
  {
    id: "pin",
    group: "Digital",
    title: "Digital out",
    prompt:
      "Use pin D2 as an adjustable power source. The pin is set to OUTPUT and can be set HIGH or LOW via digitalWrite. You are the code; click on D2 to switch it. ",
    payoff: "The secret to an ESP32 is that code can switch D2.",
    pins: { D2: { mode: "OUTPUT", level: 0 } },
    setup: () => [
      wire(pin("GND"), "tn9", "black"),
      wire(pin("D2"), "a11", "yellow"),
      resistor("c11", "c15"),
      led("d15", "d16"),
      wire("a16", "tn16", "black"),
    ],
    goals: [
      { label: "Light the LED, digitally", check: (g) => anyLit(g.analysis) },
      {
        label: "Blink the LED manually (3x)",
        check: (g) => g.stats.toggles >= 6,
      },
    ],
  },
  {
    id: "fade",
    group: "Digital",
    title: "Analog out",
    prompt:
      "As discussed, pulse-width modulation (PWM) allows us to imitate an analog signal via digital control with a high speed flicker. Set the LED to half brightness.",
    payoff:
      "The pin approximates 1.65 Volts by alternating on half the time and off for the other half.",
    pins: { D2: { mode: "OUTPUT", level: 1 } },
    setup: () => [
      wire(pin("GND"), "tn9", "black"),
      wire(pin("D2"), "a11", "yellow"),
      resistor("c11", "c15"),
      led("d15", "d16"),
      wire("a16", "tn16", "black"),
    ],
    goals: [
      {
        label: "Light the LED halfway",
        check: pwmPart,
      },
    ],
  },
  {
    id: "read-button",
    group: "Digital",
    title: "Digital in",
    prompt:
      "Connecting a pin to 3v3 via a button allows you to detect HIGH when the button is pressed. What should be changed about the pin so that it also reads LOW?",
    payoff:
      "INPUT_PULLDOWN weakly connects a pin to GND, just as INPUT_PULLUP weakly connects it to 3v3. This happens via an internal resistor. Then, the button can overpower the weak connection.",
    setup: () => [
      wire(pin("3V3"), "tp8", "red"),
      wire("tp14", "a14", "red"),
      button(14),
      wire(pin("D19"), "j16", "yellow"),
    ],
    goals: [
      { label: "D19 correctly reads HIGH or LOW", check: pinReadsButton },
    ],
  },
  {
    id: "read-knob",
    group: "Digital",
    title: "Analog in",
    prompt:
      "Now we will use the potentiometer slightly differently from before. The variable resistor can give us a variable voltage (by changing the relative resistance between GND and 3v3. Connect the outer pins to power and the middle (wiper) leg to the analog-sensing pin D34.",
    payoff:
      "An analog-to-digital converter uses analogRead to convert 0 to 3.3 Volts to a number from 0 to 4095. This can be used to control anything that needs analog sensing (e.g. speed, brightness, temperature)!",
    setup: () => [
      ...rails(),
      pot("a", 20, 0.5),
      wire("b20", "tn19", "black"),
      wire("b22", "tp23", "red"),
    ],
    goals: [
      {
        label: "Turn the potentiometer until D34 reads < 500",
        check: analogBelow(500),
      },
      { label: "... and over 3500", check: analogAbove(3500) },
    ],
  },
  {
    id: "multiplex",
    group: "Hard",
    title: "Nine wires",
    prompt:
      'Each "seven segment display" has 7 LEDs that can display any number. The eighth pin is a common ground. Can you use only nine (external) wires to control two displays simultaneously? Internal wires are not counted.',
    payoff:
      "This is a form of multiplexing-- rapidly switching between the two displays allows you to show two different numbers.",
    setup: multiplexParts,
    goals: [
      {
        label: "Wire both displays with nine (external) wires",
        check: nineWires,
      },
      {
        label: "Illuminate the left display only",
        check: onlyOne("left"),
      },
      {
        label: "Illuminate the right display only",
        check: onlyOne("right"),
      },
    ],
  },
  {
    id: "free",
    group: "Open",
    title: "Open",
    prompt: "Try anything. LEDs in parallel vs series? Different resistors?",
    setup: () => [],
    goals: [],
  },
];

export const pinsFor = (ch: Challenge): Map<NodeId, PinState> =>
  new Map(Object.entries(ch.pins ?? {}).map(([label, s]) => [pin(label), s]));
