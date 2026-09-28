// The sketches the code example opens with, each on the circuit it drives.
//
// Walkthroughs are working sketches to watch and poke. Bug hunts are broken
// the way real first sketches break — a pin that doesn't match the wiring, an
// input left floating, a boot pin the board pulls up, curly quotes pasted
// from a document, analogWrite pushed past its range — and each has a goal
// the page checks. The circuits come from the wiring example's builders, so
// a circuit built by hand there is the one the code drives here.

import type { Analysis } from "../wiring/analyze.js";
import {
  button,
  led,
  multiplexWired,
  pin,
  pot,
  rails,
  resistor,
  wire,
} from "../wiring/circuits.js";
import { potLegs, type Part } from "../wiring/model.js";

/** What the page measures while a sketch runs, for goals to check. */
export interface CodeStats {
  simMs: number;
  /** The longest the code sat spinning on one line, in ms. */
  stallMs: number;
  /** Times any LED went from lit to dark or back. */
  ledFlips: number;
  /** Per GPIO: whether digitalRead has seen a clean HIGH, a clean LOW. */
  seen: Record<number, { high: boolean; low: boolean }>;
  /** Sim time of the last read of a floating pin, and reads since. */
  lastFloat: number;
  readsSinceFloat: number;
  /** A full fade from near 0 to near 255 with no write past 255. */
  cleanSweeps: number;
  /** Button changes nobody was listening for. */
  missed: number;
  /** Lines the sketch printed. */
  printed: string[];
  /** The last wait each delay() line asked for, in ms, by line. */
  delays: Record<number, number>;
  /** GPIOs that have lit an LED. */
  litPins: number[];
  /** Laps of loop() finished, and how many of them with a button held. */
  laps: number;
  heldLaps: number;
  /** How long a button has been held in all, in ms of board time. */
  heldMs: number;
  /** analogWrite calls asked for more than 255. */
  overWrites: number;
}

export interface Sketch {
  id: string;
  group: string;
  title: string;
  /** One or two sentences: what to do or look at. */
  intro: string;
  code: string;
  circuit: () => Part[];
  /** Things to try, for walkthroughs. Each ticks itself when its check
   *  passes, and stays ticked. */
  tries?: Try[];
  goals?: Array<{ label: string; check: (s: CodeStats) => boolean }>;
  /** Shown once every goal is met. */
  payoff?: string;
  /** A panel drawn from the sketch's own variables. */
  panel?: "classifier";
}

/** The running sketch, as a try's check sees it. */
export interface Watch {
  stats: CodeStats;
  speed: "step" | "slow" | "fast" | "real";
  /** A number the sketch holds in a variable, by name. */
  peek: (name: string) => number | undefined;
  parts: Part[];
  analysis: Analysis;
  /** Sketches in which a button has been held for a second of board time. */
  heldIn: ReadonlySet<string>;
}

/** A place for a check to remember things between frames. The page keeps
 *  it for as long as the sketch is open, through edits and power cycles,
 *  which start the board (and its stats) over. */
export type Memo = Record<string, number | boolean | undefined>;

/** Something to try, and how the page knows it was done. A check looks at
 *  what the sketch does, not at its text, so a drag and a hand edit count
 *  the same. */
export interface Try {
  label: string;
  check: (w: Watch, memo: Memo) => boolean;
}

// ── Checks for things to try ───────────────────────────────────────────

/** What the first delay() in the code last waited, once it has run. */
const firstDelay = (w: Watch) => {
  const lines = Object.keys(w.stats.delays).map(Number);
  return lines.length ? w.stats.delays[Math.min(...lines)] : undefined;
};
const anyDelay = (w: Watch, ok: (ms: number) => boolean) =>
  Object.values(w.stats.delays).some(ok);

/** Run at Slow for a few seconds of board time. */
const watchedSlow = (w: Watch, m: Memo) => {
  if (w.speed !== "slow") return ((m.since = undefined), false);
  if (m.since === undefined || w.stats.simMs < (m.since as number))
    m.since = w.stats.simMs;
  return w.stats.simMs - (m.since as number) >= 3000;
};

/** A variable's value moved away from where it started. */
const moved = (w: Watch, m: Memo, name: string) => {
  const v = w.peek(name);
  if (v === undefined) return false;
  if (m[name] === undefined) m[name] = v;
  if (v !== m[name]) m[`${name}Moved`] = true;
  return m[`${name}Moved`] === true;
};

/** Which way round a knob's outer legs are: +1 with its left leg on ground
 *  and right on power, −1 the other way, 0 otherwise. */
const knobWay = (w: Watch) => {
  const k = w.parts.find((p) => p.kind === "pot");
  if (!k || k.kind !== "pot") return 0;
  const [l, , r] = potLegs(k);
  const a = w.analysis;
  const on = (id: string, nets: Set<number>) => nets.has(a.netOf(id));
  if (on(l, a.groundNets) && on(r, a.supplyNets)) return 1;
  if (on(l, a.supplyNets) && on(r, a.groundNets)) return -1;
  return 0;
};

/** The classifier's two learned averages, once it has examples of both. */
const learned = (w: Watch) => {
  const offN = w.peek("offCount") ?? 0;
  const onN = w.peek("onCount") ?? 0;
  if (!offN || !onN) return null;
  return {
    off: (w.peek("offTotal") ?? 0) / offN,
    on: (w.peek("onTotal") ?? 0) / onN,
  };
};

// ── Circuits ───────────────────────────────────────────────────────────

const ledChain = () => [
  wire(pin("D2"), "a11", "yellow"),
  resistor("c11", "c15"),
  led("d15", "d16"),
  wire("a16", "tn16", "black"),
];
const ledOnly = () => [wire(pin("GND"), "tn9", "black"), ...ledChain()];
const buttonTo = (label: string) => [
  wire("tp20", "a20", "red"),
  button(20),
  wire(pin(label), "j22", "yellow"),
];
const ledAndButton = (label = "D19") => [
  ...rails(),
  ...ledChain(),
  ...buttonTo(label),
];
const knob = () => [
  pot("a", 25, 0.5),
  wire("b25", "tn25", "black"),
  wire("b27", "tp27", "red"),
  wire("c26", pin("D34"), "orange"),
];

// ── Sketches ───────────────────────────────────────────────────────────

export const SKETCHES: Sketch[] = [
  {
    id: "blink",
    group: "Walkthroughs",
    title: "Blink",
    intro:
      "The blink sketch is the common starting point. It requires setting up the correct output pin and then blinking on and off the LED using delay to set the blink duration.",
    circuit: ledOnly,
    tries: [
      {
        label: "Adjust the first delay to 250",
        check: (w) => firstDelay(w) === 250,
      },
      {
        label: "Change LED_PIN to 4, then match it with the wire",
        check: (w) => w.stats.litPins.includes(4),
      },
    ],
    code: `int LED_PIN = 2;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);
}
`,
  },
  {
    id: "toggle",
    group: "Walkthroughs",
    title: "Bad toggle",
    intro:
      "It is surprisingly hard to write code to deal with a button. This is because you have to consider two separate things-- the button state and the output state-- and you have to map one to the other. This sketch uses delay and reading in weird and bad ways.",
    circuit: () => ledAndButton(),
    goals: [
      {
        label: "Pause the loop for 2s by pressing the button",
        check: (s) => s.stallMs > 2000,
      },
      {
        label: "Lose a second quick press to the delay",
        check: (s) => s.missed > 0,
      },
    ],
    payoff:
      "When delay is active, nothing else is read. We can be more clever by watching the clock.",
    code: `int pushButton = 19;
int ledPin = 2;
bool state = false;

void setup() {
  pinMode(pushButton, INPUT_PULLDOWN);
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  if (digitalRead(pushButton) == HIGH) {
    state = !state;
    digitalWrite(ledPin, state);
    if (state == true) Serial.println("The LED is ON");
    else Serial.println("The LED is OFF");
    while (digitalRead(pushButton) == HIGH);
    delay(500);
  }
}
`,
  },
  {
    id: "toggle-edge",
    group: "Walkthroughs",
    title: "Good toggle",
    intro:
      "This is good code to solve the same problem. The code remembers the last button press.",
    circuit: () => ledAndButton(),
    goals: [
      {
        label: "Toggle the LED 3x",
        check: (s) => s.ledFlips >= 6 && s.stallMs < 500,
      },
    ],
    payoff:
      "Considering both the current state and previous change is called edge detection.",
    tries: [
      {
        label: "The lap counter climbs when the button is pressed",
        check: (w) => w.stats.heldLaps >= 3,
      },
    ],
    code: `int pushButton = 19;
int ledPin = 2;
bool state = false;
int lastButton = LOW;

void setup() {
  pinMode(pushButton, INPUT_PULLDOWN);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int button = digitalRead(pushButton);
  if (button == HIGH && lastButton == LOW) {
    state = !state;
    digitalWrite(ledPin, state);
  }
  lastButton = button;
  delay(10);
}
`,
  },
  {
    id: "read-knob",
    group: "Walkthroughs",
    title: "Reading a knob",
    intro:
      "analogRead uses the analog-to-digital convert to change a voltage into a number. Turn the potentiometer and watch the effect in the Serial Monitor. ",
    circuit: () => [...rails(), ...knob()],
    code: `int POT_PIN = 34;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int potValue = analogRead(POT_PIN);
  Serial.println(potValue);
  Serial.print("Output Voltage: ");
  Serial.println(3.3 * potValue / 4095.0);
  delay(500);
}
`,
  },
  // Hidden for now: Fading and every sketch after it.
  //   {
  //     id: "fade",
  //     group: "Walkthroughs",
  //     title: "Fading",
  //     intro:
  //       "analogWrite flickers the pin on and off faster than the eye can see; the number sets how much of the time it's on. Two loops sweep it up and down.",
  //     circuit: ledOnly,
  //     tries: [
  //       {
  //         label: "Switch to Slow and watch the for loop count",
  //         check: watchedSlow,
  //       },
  //       {
  //         label: "Drag delay(10) to 2, then to 40",
  //         check: (w, m) => {
  //           if (anyDelay(w, (ms) => ms === 2)) m.two = true;
  //           return m.two === true && anyDelay(w, (ms) => ms === 40);
  //         },
  //       },
  //     ],
  //     code: `int LED_PIN = 2;
  //
  // void setup() {
  //   pinMode(LED_PIN, OUTPUT);
  // }
  //
  // void loop() {
  //   for (int i = 0; i <= 255; i++) {
  //     analogWrite(LED_PIN, i);
  //     delay(10);
  //   }
  //   for (int i = 255; i >= 0; i--) {
  //     analogWrite(LED_PIN, i);
  //     delay(10);
  //   }
  // }
  // `,
  //   },
  //   {
  //     id: "knob-led",
  //     group: "Walkthroughs",
  //     title: "A knob that dims",
  //     intro:
  //       "An input and an output, joined only by code: read the knob (0 to 4095), shrink it to 0–255, write it to the LED.",
  //     circuit: () => [...rails(), ...ledChain(), ...knob()],
  //     tries: [
  //       {
  //         label: "Change 16 to 8: what happens past halfway?",
  //         check: (w) => w.stats.overWrites > 0,
  //       },
  //       {
  //         label: "Swap the knob's red and black wires",
  //         check: (w, m) => {
  //           const way = knobWay(w);
  //           if (!m.way) m.way = way;
  //           return way !== 0 && way === -(m.way as number);
  //         },
  //       },
  //     ],
  //     code: `int POT_PIN = 34;
  // int LED_PIN = 2;
  //
  // void setup() {
  //   pinMode(LED_PIN, OUTPUT);
  // }
  //
  // void loop() {
  //   int reading = analogRead(POT_PIN);
  //   int brightness = reading / 16;
  //   analogWrite(LED_PIN, brightness);
  //   delay(20);
  // }
  // `,
  //   },
  //
  //   // ── Timing ───────────────────────────────────────────────────────────
  //   {
  //     id: "delay-blind",
  //     group: "Timing",
  //     title: "delay() doesn't listen",
  //     intro:
  //       "This sketch blinks and prints when the button is pressed. Tap the button quickly a few times. While delay() waits, nothing is listening.",
  //     circuit: () => ledAndButton(),
  //     goals: [{ label: "Miss a button press", check: (s) => s.missed > 0 }],
  //     payoff:
  //       "Most taps land during a delay, when the board isn't reading anything. The next sketch does the same job without waiting.",
  //     code: `const int LED = 2;
  // const int BUTTON = 19;
  // int lastButton = LOW;
  //
  // void setup() {
  //   pinMode(LED, OUTPUT);
  //   pinMode(BUTTON, INPUT_PULLDOWN);
  //   Serial.begin(115200);
  // }
  //
  // void loop() {
  //   int button = digitalRead(BUTTON);
  //   if (button == HIGH && lastButton == LOW) {
  //     Serial.println("Pressed!");
  //   }
  //   lastButton = button;
  //
  //   digitalWrite(LED, HIGH);
  //   delay(1000);
  //   digitalWrite(LED, LOW);
  //   delay(1000);
  // }
  // `,
  //   },
  //   {
  //     id: "millis",
  //     group: "Timing",
  //     title: "millis() keeps listening",
  //     intro:
  //       "The same blink, without delay(). Instead of waiting, loop() glances at the clock and only acts once a second has passed, so it reads the button thousands of times in between.",
  //     circuit: () => ledAndButton(),
  //     goals: [
  //       {
  //         label: "Catch five quick taps",
  //         check: (s) =>
  //           s.printed.filter((p) => p.includes("Pressed")).length >= 5,
  //       },
  //     ],
  //     payoff:
  //       "Nothing waits, so nothing is missed. This is how a sketch does two things at once.",
  //     code: `const int LED = 2;
  // const int BUTTON = 19;
  // int lastButton = LOW;
  // unsigned long lastBlink = 0;
  // bool ledOn = false;
  //
  // void setup() {
  //   pinMode(LED, OUTPUT);
  //   pinMode(BUTTON, INPUT_PULLDOWN);
  //   Serial.begin(115200);
  // }
  //
  // void loop() {
  //   int button = digitalRead(BUTTON);
  //   if (button == HIGH && lastButton == LOW) {
  //     Serial.println("Pressed!");
  //   }
  //   lastButton = button;
  //
  //   if (millis() - lastBlink >= 1000) {
  //     lastBlink = millis();
  //     ledOn = !ledOn;
  //     digitalWrite(LED, ledOn);
  //   }
  // }
  // `,
  //   },
  //
  //   // ── Bug hunts ────────────────────────────────────────────────────────
  //   {
  //     id: "bug-pin",
  //     group: "Bug hunts",
  //     title: "The LED that never blinks",
  //     intro:
  //       "The code runs and the LED is wired correctly, but it never blinks. Follow the thread from the code to the board.",
  //     circuit: ledOnly,
  //     goals: [{ label: "Get the LED blinking", check: (s) => s.ledFlips >= 4 }],
  //     payoff:
  //       "The code and the wiring have to agree on the pin. Fix whichever is easier: the number in the code, or where the wire goes.",
  //     code: `int LED_PIN = 13;
  //
  // void setup() {
  //   pinMode(LED_PIN, OUTPUT);
  // }
  //
  // void loop() {
  //   digitalWrite(LED_PIN, HIGH);
  //   delay(1000);
  //   digitalWrite(LED_PIN, LOW);
  //   delay(1000);
  // }
  // `,
  //   },
  //   {
  //     id: "bug-float",
  //     group: "Bug hunts",
  //     title: "The LED that toggles itself",
  //     intro:
  //       "Nobody touches the button, and the LED switches on and off by itself. Look at what D19 reads while the button is up.",
  //     circuit: () => ledAndButton(),
  //     goals: [
  //       {
  //         label: "D19 stops reading at random",
  //         check: (s) =>
  //           s.simMs > 2000 &&
  //           s.readsSinceFloat > 30 &&
  //           s.simMs - s.lastFloat > 2000,
  //       },
  //     ],
  //     payoff:
  //       "With the button up, D19 is connected to nothing and picks up noise. INPUT_PULLDOWN ties it gently to LOW until the button pushes it HIGH.",
  //     code: `int pushButton = 19;
  // int ledPin = 2;
  // bool state = false;
  //
  // void setup() {
  //   pinMode(pushButton, INPUT);
  //   pinMode(ledPin, OUTPUT);
  // }
  //
  // void loop() {
  //   if (digitalRead(pushButton) == HIGH) {
  //     state = !state;
  //     digitalWrite(ledPin, state);
  //     while (digitalRead(pushButton) == HIGH);
  //     delay(500);
  //   }
  // }
  // `,
  //   },
  //   {
  //     id: "bug-boot-pin",
  //     group: "Bug hunts",
  //     title: "The button that's always pressed",
  //     intro:
  //       "Press the button once and the LED comes on and stays on. The code thinks the button is held forever. Check what the button pin reads with nobody touching it.",
  //     circuit: () => ledAndButton("D5"),
  //     goals: [
  //       {
  //         label: "The button pin reads LOW, then HIGH when pressed",
  //         check: (s) => Object.values(s.seen).some((v) => v.low && v.high),
  //       },
  //     ],
  //     payoff:
  //       "This board pulls GPIO 5 up to 3V3 itself, because the chip checks that pin when it boots, and the board's pull-up beats INPUT_PULLDOWN. Move the button to a plain pin like D19 and change the code to match.",
  //     code: `int pushButton = 5;
  // int ledPin = 2;
  // bool state = false;
  //
  // void setup() {
  //   pinMode(pushButton, INPUT_PULLDOWN);
  //   pinMode(ledPin, OUTPUT);
  // }
  //
  // void loop() {
  //   if (digitalRead(pushButton) == HIGH) {
  //     state = !state;
  //     digitalWrite(ledPin, state);
  //     while (digitalRead(pushButton) == HIGH);
  //     delay(500);
  //   }
  // }
  // `,
  //   },
  //   {
  //     id: "bug-quotes",
  //     group: "Bug hunts",
  //     title: "Code that won't start",
  //     intro:
  //       "This was copied out of a document, and it won't even start. Read the message, then press Edit to fix it.",
  //     circuit: ledOnly,
  //     goals: [{ label: "Get it running", check: (s) => s.simMs > 300 }],
  //     payoff:
  //       "Word processors swap straight quotes for curly ones. The code looks right to people, but it isn't valid code.",
  //     code: `int LED_PIN = 2;
  //
  // void setup() {
  //   pinMode(LED_PIN, OUTPUT);
  //   Serial.begin(115200);
  // }
  //
  // void loop() {
  //   digitalWrite(LED_PIN, HIGH);
  //   Serial.println(“on”);
  //   delay(1000);
  //   digitalWrite(LED_PIN, LOW);
  //   Serial.println(“off”);
  //   delay(1000);
  // }
  // `,
  //   },
  //   {
  //     id: "bug-4095",
  //     group: "Bug hunts",
  //     title: "The fade that sticks",
  //     intro:
  //       "This fade takes ages: it brightens quickly, then sits at full for a long time. The loop counts much further than analogWrite can go.",
  //     circuit: ledOnly,
  //     goals: [
  //       {
  //         label: "A smooth fade, every value between 0 and 255",
  //         check: (s) => s.cleanSweeps > 0,
  //       },
  //     ],
  //     payoff:
  //       "analogWrite takes 0 to 255. analogRead gives 0 to 4095. The two ranges differ, and mixing them up is one of the most common bugs.",
  //     code: `int LED_PIN = 2;
  //
  // void setup() {
  //   pinMode(LED_PIN, OUTPUT);
  // }
  //
  // void loop() {
  //   for (int i = 0; i <= 4095; i++) {
  //     analogWrite(LED_PIN, i);
  //     delay(2);
  //   }
  //   for (int i = 4095; i >= 0; i--) {
  //     analogWrite(LED_PIN, i);
  //     delay(2);
  //   }
  // }
  // `,
  //   },
  //
  //   // ── Projects ─────────────────────────────────────────────────────────
  //   {
  //     id: "multiplex",
  //     group: "Projects",
  //     title: "Two displays, nine wires",
  //     intro:
  //       "Both displays share seven segment wires. The code lights the left one, then the right, 100 times a second, so your eye sees both. Switch to Slow to see the trick.",
  //     circuit: multiplexWired,
  //     tries: [
  //       {
  //         label: "Switch to Slow",
  //         check: (w) => w.speed === "slow",
  //       },
  //       {
  //         label: "Drag leftDigit and rightDigit",
  //         check: (w, m) => {
  //           // Both, every frame, so each records where it started.
  //           const left = moved(w, m, "leftDigit");
  //           const right = moved(w, m, "rightDigit");
  //           return left && right;
  //         },
  //       },
  //       {
  //         label: "Drag delay(5) up to 40 and watch it start to flicker",
  //         check: (w) => anyDelay(w, (ms) => ms >= 40),
  //       },
  //     ],
  //     code: `// Seven segment pins, shared by both displays: a b c d e f g
  // const int SEGMENTS[7] = {13, 12, 14, 27, 26, 25, 33};
  // const int LEFT_GROUND = 32;
  // const int RIGHT_GROUND = 4;
  //
  // // Which segments make each digit, 0 to 9
  // const int DIGITS[10][7] = {
  //   {1, 1, 1, 1, 1, 1, 0},
  //   {0, 1, 1, 0, 0, 0, 0},
  //   {1, 1, 0, 1, 1, 0, 1},
  //   {1, 1, 1, 1, 0, 0, 1},
  //   {0, 1, 1, 0, 0, 1, 1},
  //   {1, 0, 1, 1, 0, 1, 1},
  //   {1, 0, 1, 1, 1, 1, 1},
  //   {1, 1, 1, 0, 0, 0, 0},
  //   {1, 1, 1, 1, 1, 1, 1},
  //   {1, 1, 1, 1, 0, 1, 1}
  // };
  //
  // int leftDigit = 4;
  // int rightDigit = 2;
  //
  // void setup() {
  //   for (int i = 0; i < 7; i++) {
  //     pinMode(SEGMENTS[i], OUTPUT);
  //   }
  //   pinMode(LEFT_GROUND, OUTPUT);
  //   pinMode(RIGHT_GROUND, OUTPUT);
  // }
  //
  // void show(int digit) {
  //   for (int i = 0; i < 7; i++) {
  //     digitalWrite(SEGMENTS[i], DIGITS[digit][i]);
  //   }
  // }
  //
  // void loop() {
  //   digitalWrite(RIGHT_GROUND, HIGH);
  //   show(leftDigit);
  //   digitalWrite(LEFT_GROUND, LOW);
  //   delay(5);
  //
  //   digitalWrite(LEFT_GROUND, HIGH);
  //   show(rightDigit);
  //   digitalWrite(RIGHT_GROUND, LOW);
  //   delay(5);
  // }
  // `,
  //   },
  //   {
  //     id: "classifier",
  //     group: "Projects",
  //     title: "A classifier that learns",
  //     intro:
  //       'Teach it by example. Turn the knob to where "off" should be and press the button, three times. Then do the same for "on" three times. After that it decides on its own.',
  //     circuit: () => [...ledAndButton(), ...knob()],
  //     panel: "classifier",
  //     tries: [
  //       {
  //         label:
  //           "Teach it OFF around 1000 and ON around 3000, then sweep the knob",
  //         check: (w, m) => {
  //           const l = learned(w);
  //           const taught =
  //             !!l && Math.abs(l.off - 1000) < 400 && Math.abs(l.on - 3000) < 400;
  //           if (taught && m.flips === undefined) m.flips = w.stats.ledFlips;
  //           if (m.flips !== undefined && w.stats.ledFlips < (m.flips as number))
  //             m.flips = w.stats.ledFlips;
  //           return (
  //             m.flips !== undefined && w.stats.ledFlips >= (m.flips as number) + 2
  //           );
  //         },
  //       },
  //       {
  //         label: "Teach it backwards: ON low, OFF high",
  //         check: (w) => {
  //           const l = learned(w);
  //           return !!l && l.on < l.off;
  //         },
  //       },
  //     ],
  //     code: `// Learns "off" and "on" from examples, then decides for itself.
  // const int POT = 34;
  // const int LED = 2;
  // const int BUTTON = 19;
  //
  // int reading = 0;
  // float offTotal = 0;
  // int offCount = 0;
  // float onTotal = 0;
  // int onCount = 0;
  //
  // void setup() {
  //   pinMode(LED, OUTPUT);
  //   pinMode(BUTTON, INPUT_PULLDOWN);
  //   Serial.begin(115200);
  // }
  //
  // void loop() {
  //   reading = analogRead(POT);
  //
  //   // Training: each press is one example.
  //   // The first three are OFF, the next three are ON.
  //   if (digitalRead(BUTTON) == HIGH) {
  //     if (offCount < 3) {
  //       offTotal += reading;
  //       offCount++;
  //       Serial.println("learned an OFF example");
  //     } else if (onCount < 3) {
  //       onTotal += reading;
  //       onCount++;
  //       Serial.println("learned an ON example");
  //     }
  //     while (digitalRead(BUTTON) == HIGH);
  //   }
  //
  //   // Deciding: which average is this reading closer to?
  //   if (offCount > 0 && onCount > 0) {
  //     float offAverage = offTotal / offCount;
  //     float onAverage = onTotal / onCount;
  //     if (abs(reading - onAverage) < abs(reading - offAverage)) {
  //       digitalWrite(LED, HIGH);
  //     } else {
  //       digitalWrite(LED, LOW);
  //     }
  //   }
  //   delay(20);
  // }
  // `,
  //   },
];
