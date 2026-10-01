// Geometry and parts for the wiring example.
//
// Everything lives in one SVG coordinate system: a half-size breadboard with
// a 30-pin ESP32 development board above it. A "node" is anything a leg or a
// wire end can sit in — a breadboard hole or a board pin — and is named by a
// short string id so parts, the connection graph and the renderer all agree
// on it without sharing objects.
//
//   hole ids   "a1" … "j30"          terminal strips (rows a–j, columns 1–30)
//              "tp5" "tn5"           top rails, + and −
//              "bn5" "bp5"           bottom rails, − and +
//   pin ids    "pin:T0" … "pin:T14"  the board's far row, left to right
//              "pin:B0" … "pin:B14"  the board's near row, left to right

/** Hole pitch: one tenth of an inch, in SVG units. */
export const P = 20;
export const COLS = 30;

export const VIEW_W = 680;
export const VIEW_H = 670;

export const MAIN_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
export type MainRow = (typeof MAIN_ROWS)[number];
export const RAILS = ["tp", "tn", "bn", "bp"] as const;
export type Rail = (typeof RAILS)[number];

export type NodeId = string;

// ── Breadboard ─────────────────────────────────────────────────────────

export const BB_X0 = 20;
export const BB_X1 = 660;
export const BB_Y = 286;
export const BB_Y1 = BB_Y + 18 * P;

export const colX = (c: number) => 55 + (c - 1) * P;

const ROW_Y: Record<MainRow | Rail, number> = {
  tp: BB_Y + 1 * P,
  tn: BB_Y + 2 * P,
  a: BB_Y + 3.5 * P,
  b: BB_Y + 4.5 * P,
  c: BB_Y + 5.5 * P,
  d: BB_Y + 6.5 * P,
  e: BB_Y + 7.5 * P,
  f: BB_Y + 10.5 * P,
  g: BB_Y + 11.5 * P,
  h: BB_Y + 12.5 * P,
  i: BB_Y + 13.5 * P,
  j: BB_Y + 14.5 * P,
  bn: BB_Y + 16 * P,
  bp: BB_Y + 17 * P,
};
export const rowY = (r: MainRow | Rail) => ROW_Y[r];
export const CHANNEL_Y = (ROW_Y.e + ROW_Y.f) / 2;

/** Rail holes come in groups of five with a gap, as on a real board. */
export const railHasCol = (c: number) => (c - 1) % 6 !== 5;

export const isRail = (r: string): r is Rail => (RAILS as readonly string[]).includes(r);
export const railSign = (r: Rail): "+" | "−" => (r === "tp" || r === "bp" ? "+" : "−");

export interface HoleInfo {
  id: NodeId;
  row: MainRow | Rail;
  col: number;
  x: number;
  y: number;
}

export const HOLES: HoleInfo[] = [];
for (const r of [...RAILS, ...MAIN_ROWS]) {
  for (let c = 1; c <= COLS; c++) {
    if (isRail(r) && !railHasCol(c)) continue;
    HOLES.push({ id: `${r}${c}`, row: r, col: c, x: colX(c), y: ROW_Y[r] });
  }
}

/** Groups of holes joined by the metal clips inside the breadboard. Each is
 *  listed in physical order, so a path along it reads left to right. */
export const STRIPS: NodeId[][] = [];
for (let c = 1; c <= COLS; c++) {
  STRIPS.push(["a", "b", "c", "d", "e"].map((r) => `${r}${c}`));
  STRIPS.push(["f", "g", "h", "i", "j"].map((r) => `${r}${c}`));
}
for (const r of RAILS) {
  const holes: NodeId[] = [];
  for (let c = 1; c <= COLS; c++) if (railHasCol(c)) holes.push(`${r}${c}`);
  STRIPS.push(holes);
}

// ── The development board ──────────────────────────────────────────────
//
// The common 30-pin layout: USB at the left end, the radio module's antenna
// at the right. Labels are what is printed beside each pin; `gpio` is the
// number the code uses. Boards differ in their printing (D19, G19, IO19) —
// that is a problem the pin page takes on, not this one.

export const BOARD = {
  x0: 140,
  x1: 540,
  y0: 16,
  y1: 16 + 11 * P,
};
const PIN_X0 = 340 - 7 * P;
export const PIN_ROW_Y = { T: BOARD.y0 + P, B: BOARD.y0 + 10 * P };

/** "serial" pins are GPIOs the board has given to a serial line: RX0/TX0
 *  carry the USB connection to the computer, and RX2/TX2 are printed as the
 *  second serial port. They are left out of digital work, so a beginner
 *  never wires a part to one. */
export type PinKind = "3v3" | "vin" | "gnd" | "gpio" | "en" | "serial";

export interface PinInfo {
  id: NodeId;
  label: string;
  kind: PinKind;
  gpio?: number;
  /** GPIO 34–39 can read a voltage but cannot drive one, and have no
   *  pull-up or pull-down resistors inside. */
  inputOnly?: boolean;
  /** Can analogRead. */
  analog?: boolean;
  side: "T" | "B";
  x: number;
  y: number;
}

/** Pins that can analogRead: those on the chip's first analog-to-digital
 *  converter (ADC1). The second (ADC2: GPIO 0, 2, 4, 12–15, 25–27) stops
 *  working whenever Wi-Fi is on, so, as most pinouts advise, this board
 *  treats those pins as digital only. */
export const ADC_GPIOS = new Set([32, 33, 34, 35, 36, 39]);

const TOP_LABELS = ["VIN", "GND", "D13", "D12", "D14", "D27", "D26", "D25", "D33", "D32", "D35", "D34", "VN", "VP", "EN"];
const BOTTOM_LABELS = ["3V3", "GND", "D15", "D2", "D4", "RX2", "TX2", "D5", "D18", "D19", "D21", "RX0", "TX0", "D22", "D23"];
const NAMED_GPIO: Record<string, number> = { VN: 39, VP: 36, RX2: 16, TX2: 17, RX0: 3, TX0: 1 };

function pinFrom(label: string, side: "T" | "B", i: number): PinInfo {
  const base = { id: `pin:${side}${i}`, label, side, x: PIN_X0 + i * P, y: PIN_ROW_Y[side] };
  if (label === "3V3") return { ...base, kind: "3v3" };
  if (label === "VIN") return { ...base, kind: "vin" };
  if (label === "GND") return { ...base, kind: "gnd" };
  if (label === "EN") return { ...base, kind: "en" };
  const gpio = label.startsWith("D") ? Number(label.slice(1)) : NAMED_GPIO[label]!;
  if (label.startsWith("RX") || label.startsWith("TX")) return { ...base, kind: "serial", gpio };
  return { ...base, kind: "gpio", gpio, inputOnly: gpio >= 34, analog: ADC_GPIOS.has(gpio) };
}

export const PINS: PinInfo[] = [
  ...TOP_LABELS.map((l, i) => pinFrom(l, "T", i)),
  ...BOTTOM_LABELS.map((l, i) => pinFrom(l, "B", i)),
];
export const PIN_BY_ID = new Map(PINS.map((p) => [p.id, p]));

/** What a pin can do, in the words a pinout uses. */
export function pinAbilities(p: PinInfo): string[] {
  if (p.kind !== "gpio") return [];
  const out = ["digital in"];
  if (!p.inputOnly) out.push("digital out", "PWM");
  if (p.analog) out.push("analog in");
  return out;
}

/** Whether a pin can be set to a mode, as the real chip allows. */
export function pinAllows(p: PinInfo, mode: PinState["mode"]): boolean {
  if (p.kind !== "gpio") return false;
  if (mode === "OUTPUT" || mode === "PWM") return !p.inputOnly;
  if (mode === "INPUT_PULLDOWN" || mode === "INPUT_PULLUP") return !p.inputOnly;
  return true;
}
/** Look a pin up by its printed label; the first GND if asked for "GND". */
export const pinId = (label: string, side?: "T" | "B") =>
  PINS.find((p) => p.label === label && (!side || p.side === side))!.id;

// ── Node lookup ────────────────────────────────────────────────────────

const HOLE_BY_ID = new Map(HOLES.map((h) => [h.id, h]));
export const holeInfo = (id: NodeId) => HOLE_BY_ID.get(id);

export function nodeXY(id: NodeId): { x: number; y: number } {
  const n = HOLE_BY_ID.get(id) ?? PIN_BY_ID.get(id);
  return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
}

/** The node under a point, if one is close enough to snap to. */
export function nearestNode(x: number, y: number): NodeId | null {
  let best: NodeId | null = null;
  let bestD = (P * 0.55) ** 2;
  for (const p of PINS) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) (bestD = d), (best = p.id);
  }
  const c = Math.round((x - colX(1)) / P) + 1;
  if (c >= 1 && c <= COLS) {
    for (const r of [...RAILS, ...MAIN_ROWS]) {
      const h = HOLE_BY_ID.get(`${r}${c}`);
      if (!h) continue;
      const d = (h.x - x) ** 2 + (h.y - y) ** 2;
      if (d < bestD) (bestD = d), (best = h.id);
    }
  }
  return best;
}

/** The control point of a jumper's gentle arc. Symmetric in its ends, so the
 *  current overlay and the diagram can retrace it in either direction. */
export function arcControl(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) (nx = -nx), (ny = -ny);
  const bulge = Math.min(46, 6 + len * 0.16);
  return { x: (a.x + b.x) / 2 + nx * bulge, y: (a.y + b.y) / 2 + ny * bulge };
}

/** A short human name for where a node is: "strip 12 a–e", "+ rail". */
export function placeName(id: NodeId): string {
  const pin = PIN_BY_ID.get(id);
  if (pin) return pin.label;
  const h = HOLE_BY_ID.get(id);
  if (!h) return id;
  if (isRail(h.row)) return `${railSign(h.row)} rail ${h.row[0] === "t" ? "(top)" : "(bottom)"}`;
  return `strip ${h.col} ${"abcde".includes(h.row) ? "a–e" : "f–j"}`;
}

// ── Parts ──────────────────────────────────────────────────────────────

export type PartKind = "wire" | "resistor" | "led" | "button" | "pot" | "seg7";

/** A two-legged part: a wire, a resistor, or an LED (a = long leg). */
export interface TwoLeg {
  id: string;
  kind: "wire" | "resistor" | "led";
  a: NodeId;
  b: NodeId;
  color?: string;
  /** Resistors only: resistance in ohms. */
  ohms?: number;
}

/** A four-legged push button straddling the centre channel at columns
 *  `col` and `col + 2`. Its legs leave the body from two opposite sides,
 *  and each leg is joined inside to the leg facing it across the body;
 *  pressing joins the two pairs. Upright, the legs leave from the top and
 *  bottom, so each pair runs across the channel and a press joins column
 *  `col` to column `col + 2`. Turned, they leave from the left and right:
 *  the columns are joined all the time, and the press does nothing useful. */
export interface Button {
  id: string;
  kind: "button";
  col: number;
  turned: boolean;
}

/** A potentiometer: three legs in a row at `col`, `col + 1`, `col + 2`.
 *  The outer legs are the two ends of a fixed resistance; the middle leg,
 *  the wiper, slides along it. `turn` runs 0 (wiper at the left leg) to 1. */
export interface Pot {
  id: string;
  kind: "pot";
  row: MainRow;
  col: number;
  turn: number;
}

/** A common-ground seven-segment display straddling the channel at
 *  columns `col`…`col + 3`. Eight legs: along the top (row e) g f a b,
 *  along the bottom (row f) e d c GND. Each segment is an LED from its own
 *  leg to the one ground leg. There is no decimal point. */
export interface Seg7 {
  id: string;
  kind: "seg7";
  col: number;
}

export type Part = TwoLeg | Button | Pot | Seg7;

/** Legs per row, and so the display's width in columns. */
export const SEG_WIDTH = 4;
export const SEG_TOP = ["g", "f", "a", "b"] as const;
export const SEG_BOTTOM = ["e", "d", "c", "GND"] as const;
export const SEGMENTS = ["a", "b", "c", "d", "e", "f", "g"] as const;
export type Segment = (typeof SEGMENTS)[number];

export function seg7Legs(p: Seg7): NodeId[] {
  return [...SEG_TOP.map((_, i) => `e${p.col + i}`), ...SEG_BOTTOM.map((_, i) => `f${p.col + i}`)];
}

/** The leg a segment's LED starts from. */
export function segLeg(p: Seg7, s: Segment): NodeId {
  const t = (SEG_TOP as readonly string[]).indexOf(s);
  if (t >= 0) return `e${p.col + t}`;
  return `f${p.col + (SEG_BOTTOM as readonly string[]).indexOf(s)}`;
}
export const segGround = (p: Seg7): NodeId => `f${p.col + SEG_BOTTOM.indexOf("GND")}`;

export const POT_OHMS = 10_000;
export const RESISTOR_CHOICES = [100, 220, 1_000, 10_000];
export const formatOhms = (r: number) => (r >= 1000 ? `${r / 1000}k` : `${r}`) + " Ω";

export function buttonLegs(b: Button): [NodeId, NodeId, NodeId, NodeId] {
  return [`e${b.col}`, `f${b.col}`, `e${b.col + 2}`, `f${b.col + 2}`];
}

/** The two always-joined pairs of a button's legs. */
export function buttonPairs(b: Button): [[NodeId, NodeId], [NodeId, NodeId]] {
  const [e0, f0, e2, f2] = buttonLegs(b);
  return b.turned
    ? [
        [e0, e2],
        [f0, f2],
      ]
    : [
        [e0, f0],
        [e2, f2],
      ];
}

export function potLegs(p: Pot): [NodeId, NodeId, NodeId] {
  return [`${p.row}${p.col}`, `${p.row}${p.col + 1}`, `${p.row}${p.col + 2}`];
}

export function legsOf(p: Part): NodeId[] {
  if (p.kind === "button") return buttonLegs(p);
  if (p.kind === "pot") return potLegs(p);
  if (p.kind === "seg7") return seg7Legs(p);
  return [p.a, p.b];
}

// ── Pins as code sets them ─────────────────────────────────────────────
//
// The modes are the ones a sketch uses, named the way a sketch names them,
// so the code example can take over setting them without new vocabulary.

export type PinState =
  | { mode: "INPUT" }
  | { mode: "INPUT_PULLDOWN" }
  | { mode: "INPUT_PULLUP" }
  | { mode: "OUTPUT"; level: 0 | 1 }
  | { mode: "PWM"; duty: number };

export const DEFAULT_PIN: PinState = { mode: "INPUT" };

/** GPIOs this board ties to 3V3 through its own resistor, so they read HIGH
 *  when nothing pulls them down. Many ESP32 boards pull GPIO 5 up (it is a
 *  boot-mode pin); a button wired from 3V3 to it can never read LOW. */
export const BOARD_PULLUPS = new Set([5]);


export const WIRE_COLORS = {
  red: "#d0342c",
  black: "#2b2b2b",
  yellow: "#e2b007",
  green: "#2f8f46",
  blue: "#2b62a8",
  orange: "#e0701c",
} as const;
export type WireColor = keyof typeof WIRE_COLORS;

// Colours for "Colour by connection".
// Supply and ground keep the colours a jumper-wire convention already gives
// them; the rest take the general data-mark hues.
export const NET_SUPPLY = "var(--salmon-600)";
export const NET_GROUND = "var(--ink-700, #3d3831)";
export const NET_HUES = ["var(--purple-600)", "var(--amber-600)", "var(--green-600)", "var(--blue-600)", "#00879c"];

export const PART_NAMES: Record<PartKind, string> = {
  wire: "Wire",
  resistor: "Resistor",
  led: "LED",
  button: "Button",
  pot: "Potentiometer",
  seg7: "Display",
};
