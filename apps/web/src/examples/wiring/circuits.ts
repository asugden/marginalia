// Part builders and the stock circuits both examples start from.
//
// The wiring example's challenges and the code example's sketches share
// these, so a circuit the reader wires by hand on one page is exactly the
// circuit the code drives on the other.

import { pinId, type MainRow, type NodeId, type Part, type WireColor } from "./model.js";

let seq = 0;
const uid = (k: string) => `${k}-${++seq}`;

export const wire = (a: NodeId, b: NodeId, color: WireColor): Part => ({ id: uid("w"), kind: "wire", a, b, color });
export const resistor = (a: NodeId, b: NodeId, ohms = 220): Part => ({ id: uid("r"), kind: "resistor", a, b, ohms });
export const led = (anode: NodeId, cathode: NodeId): Part => ({ id: uid("led"), kind: "led", a: anode, b: cathode });
export const button = (col: number, turned = false): Part => ({ id: uid("btn"), kind: "button", col, turned });
export const pot = (row: MainRow, col: number, turn = 0.5): Part => ({ id: uid("pot"), kind: "pot", row, col, turn });
export const seg7 = (col: number): Part => ({ id: uid("seg"), kind: "seg7", col });

/** A pin by its printed label; "GND" means the one nearest the breadboard. */
export const pin = (label: string) => pinId(label, label === "GND" ? "B" : undefined);

/** The board's power onto the top rails. */
export const rails = () => [wire(pin("3V3"), "tp8", "red"), wire(pin("GND"), "tn9", "black")];

/** An LED and its resistor on a pin, returning to the top − rail. */
export const ledOnPin = (label: string) => [
  wire(pin("GND"), "tn9", "black"),
  wire(pin(label), "a11", "yellow"),
  resistor("c11", "c15"),
  led("d15", "d16"),
  wire("a16", "tn16", "black"),
];

// ── Two displays, nine wires ───────────────────────────────────────────
//
// Two common-ground displays share seven segment lines; each display's
// ground has a pin of its own. Each line has one resistor, between its pin
// and the displays, so it protects whichever display is listening.
//
//   left display  columns 2–6     right display  columns 20–24
//   segment pins  a D13 · b D12 · c D14 · d D27 · e D26 · f D25 · g D33
//   ground pins   left D32 · right D4

export const MUX_PINS = {
  segments: { a: "D13", b: "D12", c: "D14", d: "D27", e: "D26", f: "D25", g: "D33" },
  left: "D32",
  right: "D4",
} as const;

/** The displays and the seven resistors: the puzzle's starting point. */
export const multiplexParts = (): Part[] => [
  seg7(2),
  seg7(20),
  // Each resistor runs from the strip its pin will land on to the left
  // display's segment strip.
  resistor("a8", "a2"), //  g
  resistor("b9", "b3"), //  f
  resistor("c10", "c5"), // a
  resistor("d11", "d6"), // b
  resistor("j8", "j2"), //  e
  resistor("i9", "i3"), //  d
  resistor("h10", "h5"), // c
];

/** The same, fully wired: the shared lines and the nine board wires. */
export const multiplexWired = (): Part[] => {
  const s = MUX_PINS.segments;
  return [
    ...multiplexParts(),
    // Each segment line carried across to the right display.
    wire("c2", "c20", "green"), // g
    wire("a3", "a21", "green"), // f
    wire("a5", "a23", "green"), // a
    wire("a6", "a24", "green"), // b
    wire("g2", "g20", "blue"), //  e
    wire("h3", "h21", "blue"), //  d
    wire("g5", "g23", "blue"), //  c
    // Nine wires to the board.
    wire(pin(s.a), "b10", "yellow"),
    wire(pin(s.b), "b11", "yellow"),
    wire(pin(s.c), "g10", "yellow"),
    wire(pin(s.d), "g9", "yellow"),
    wire(pin(s.e), "g8", "yellow"),
    wire(pin(s.f), "a9", "yellow"),
    wire(pin(s.g), "b8", "yellow"),
    wire(pin(MUX_PINS.left), "a4", "black"),
    wire(pin(MUX_PINS.right), "a22", "black"),
  ];
};
