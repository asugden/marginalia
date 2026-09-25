// The sketches the code example opens with, each on the circuit it drives.
//
// Walkthroughs are working sketches to watch and poke. Bug hunts are broken
// the way real first sketches break — a pin that doesn't match the wiring, an
// input left floating, a boot pin the board pulls up, curly quotes pasted
// from a document, analogWrite pushed past its range — and each has a goal
// the page checks. The circuits come from the wiring example's builders, so
// a circuit built by hand there is the one the code drives here.

import { button, led, multiplexWired, pin, pot, rails, resistor, wire } from "../wiring/circuits.js";
import type { Part } from "../wiring/model.js";

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
}

export interface Sketch {
  id: string;
  group: string;
  title: string;
  /** One or two sentences: what to do or look at. */
  intro: string;
  code: string;
  circuit: () => Part[];
  /** Things to try, for walkthroughs. */
  tries?: string[];
  goals?: Array<{ label: string; check: (s: CodeStats) => boolean }>;
  /** Shown once every goal is met. */
  payoff?: string;
  /** A panel drawn from the sketch's own variables. */
  panel?: "classifier";
  /** Start in this speed. */
  speed?: "slow" | "fast" | "real";
}

// ── Circuits ───────────────────────────────────────────────────────────

const ledChain = () => [wire(pin("D2"), "a11", "yellow"), resistor("c11", "c15"), led("d15", "d16"), wire("a16", "tn16", "black")];
const ledOnly = () => [wire(pin("GND"), "tn9", "black"), ...ledChain()];
const buttonTo = (label: string) => [wire("tp20", "a20", "red"), button(20), wire(pin(label), "j22", "yellow")];
const ledAndButton = (label = "D19") => [...rails(), ...ledChain(), ...buttonTo(label)];
const knob = () => [pot("a", 25, 0.5), wire("b25", "tn25", "black"), wire("b27", "tp27", "red"), wire("c26", pin("D34"), "orange")];

// ── Sketches ───────────────────────────────────────────────────────────

export const SKETCHES: Sketch[] = [
  {
    id: "blink",
    group: "Walkthroughs",
    title: "Blink",
    intro: "The first sketch everyone runs. Watch setup() run once, then loop() go round and round. Drag either 1000 to change the timing.",
    circuit: ledOnly,
    tries: ["Drag the first delay down to 100", "Change LED_PIN to 4, then move the yellow wire to D4"],
    code: `int LED_PIN = 2;   // the pin the LED is wired to

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
    title: "A toggle that freezes the board",
    intro:
      "This button toggle is everywhere, and it works, but badly. Hold the button: the code sits on the while line, the lap counter stops, and the board can do nothing else. Then tap twice quickly.",
    circuit: () => ledAndButton(),
    goals: [
      { label: "Freeze the loop for two seconds by holding the button", check: (s) => s.stallMs > 2000 },
      { label: "Lose a quick second tap to delay(500)", check: (s) => s.missed > 0 },
    ],
    payoff:
      "Waiting inside loop() stops everything else: no blinking, no reading, no sensors. The next sketch toggles on the moment the button goes down, and never waits.",
    code: `int pushButton = 19;   // the button's pin
int ledPin = 2;        // the LED's pin
bool state = false;    // is the LED on?

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
    while (digitalRead(pushButton) == HIGH);   // wait for the release
    delay(500);
  }
}
`,
  },
  {
    id: "toggle-edge",
    group: "Walkthroughs",
    title: "A toggle that never waits",
    intro:
      "The same job without waiting. The code remembers what the button read last time, and toggles only at the moment it changes from LOW to HIGH. loop() keeps going round the whole time.",
    circuit: () => ledAndButton(),
    speed: "fast",
    goals: [{ label: "Toggle it three times without the loop ever stalling", check: (s) => s.ledFlips >= 6 && s.stallMs < 500 }],
    payoff:
      "Remembering the last reading and reacting to the change is called edge detection. It's how nearly every well-behaved sketch reads a button.",
    tries: ["Hold the button: the lap counter keeps climbing", "Compare the lap counter with the previous sketch while you hold the button"],
    code: `int pushButton = 19;
int ledPin = 2;
bool state = false;
int lastButton = LOW;   // what the button read last time round

void setup() {
  pinMode(pushButton, INPUT_PULLDOWN);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int button = digitalRead(pushButton);
  if (button == HIGH && lastButton == LOW) {   // only the moment it goes down
    state = !state;
    digitalWrite(ledPin, state);
  }
  lastButton = button;
  delay(10);   // gives the contacts a moment to settle
}
`,
  },
  {
    id: "read-knob",
    group: "Walkthroughs",
    title: "Reading a knob",
    intro: "analogRead turns a voltage into a number. Turn the knob and watch the number beside the line, and the serial monitor below.",
    circuit: () => [...rails(), ...knob()],
    speed: "fast",
    code: `int POT_PIN = 34;   // a pin that can measure voltage

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
  {
    id: "fade",
    group: "Walkthroughs",
    title: "Fading",
    intro: "analogWrite flickers the pin on and off faster than the eye can see; the number sets how much of the time it's on. Two loops sweep it up and down.",
    circuit: ledOnly,
    speed: "real",
    tries: ["Switch to Slow and watch the for loop count", "Drag delay(10) to 2, then to 40"],
    code: `int LED_PIN = 2;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  for (int i = 0; i <= 255; i++) {   // brighter
    analogWrite(LED_PIN, i);
    delay(10);
  }
  for (int i = 255; i >= 0; i--) {   // dimmer
    analogWrite(LED_PIN, i);
    delay(10);
  }
}
`,
  },
  {
    id: "knob-led",
    group: "Walkthroughs",
    title: "A knob that dims",
    intro: "An input and an output, joined only by code: read the knob (0 to 4095), shrink it to 0–255, write it to the LED.",
    circuit: () => [...rails(), ...ledChain(), ...knob()],
    speed: "real",
    tries: ["Change 16 to 8: what happens past halfway?", "Swap the knob's red and black wires"],
    code: `int POT_PIN = 34;
int LED_PIN = 2;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int reading = analogRead(POT_PIN);   // 0 to 4095
  int brightness = reading / 16;       // 0 to 255
  analogWrite(LED_PIN, brightness);
  delay(20);
}
`,
  },

  // ── Timing ───────────────────────────────────────────────────────────
  {
    id: "delay-blind",
    group: "Timing",
    title: "delay() doesn't listen",
    intro: "This sketch blinks and prints when the button is pressed. Tap the button quickly a few times. While delay() waits, nothing is listening.",
    circuit: () => ledAndButton(),
    speed: "real",
    goals: [{ label: "Miss a button press", check: (s) => s.missed > 0 }],
    payoff: "Most taps land during a delay, when the board isn't reading anything. The next sketch does the same job without waiting.",
    code: `const int LED = 2;
const int BUTTON = 19;
int lastButton = LOW;

void setup() {
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLDOWN);
  Serial.begin(115200);
}

void loop() {
  int button = digitalRead(BUTTON);
  if (button == HIGH && lastButton == LOW) {
    Serial.println("Pressed!");
  }
  lastButton = button;

  digitalWrite(LED, HIGH);
  delay(1000);
  digitalWrite(LED, LOW);
  delay(1000);
}
`,
  },
  {
    id: "millis",
    group: "Timing",
    title: "millis() keeps listening",
    intro: "The same blink, without delay(). Instead of waiting, loop() glances at the clock and only acts once a second has passed, so it reads the button thousands of times in between.",
    circuit: () => ledAndButton(),
    speed: "real",
    goals: [{ label: "Catch five quick taps", check: (s) => s.printed.filter((p) => p.includes("Pressed")).length >= 5 }],
    payoff: "Nothing waits, so nothing is missed. This is how a sketch does two things at once.",
    code: `const int LED = 2;
const int BUTTON = 19;
int lastButton = LOW;
unsigned long lastBlink = 0;
bool ledOn = false;

void setup() {
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLDOWN);
  Serial.begin(115200);
}

void loop() {
  int button = digitalRead(BUTTON);
  if (button == HIGH && lastButton == LOW) {
    Serial.println("Pressed!");
  }
  lastButton = button;

  if (millis() - lastBlink >= 1000) {   // has a second passed?
    lastBlink = millis();
    ledOn = !ledOn;
    digitalWrite(LED, ledOn);
  }
}
`,
  },

  // ── Bug hunts ────────────────────────────────────────────────────────
  {
    id: "bug-pin",
    group: "Bug hunts",
    title: "The LED that never blinks",
    intro: "The code runs and the LED is wired correctly, but it never blinks. Follow the thread from the code to the board.",
    circuit: ledOnly,
    goals: [{ label: "Get the LED blinking", check: (s) => s.ledFlips >= 4 }],
    payoff: "The code and the wiring have to agree on the pin. Fix whichever is easier: the number in the code, or where the wire goes.",
    code: `int LED_PIN = 13;

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
    id: "bug-float",
    group: "Bug hunts",
    title: "The LED that toggles itself",
    intro: "Nobody touches the button, and the LED switches on and off by itself. Look at what D19 reads while the button is up.",
    circuit: () => ledAndButton(),
    speed: "fast",
    goals: [{ label: "D19 stops reading at random", check: (s) => s.simMs > 2000 && s.readsSinceFloat > 30 && s.simMs - s.lastFloat > 2000 }],
    payoff: "With the button up, D19 is connected to nothing and picks up noise. INPUT_PULLDOWN ties it gently to LOW until the button pushes it HIGH.",
    code: `int pushButton = 19;
int ledPin = 2;
bool state = false;

void setup() {
  pinMode(pushButton, INPUT);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  if (digitalRead(pushButton) == HIGH) {
    state = !state;
    digitalWrite(ledPin, state);
    while (digitalRead(pushButton) == HIGH);
    delay(500);
  }
}
`,
  },
  {
    id: "bug-boot-pin",
    group: "Bug hunts",
    title: "The button that's always pressed",
    intro: "Press the button once and the LED comes on and stays on. The code thinks the button is held forever. Check what the button pin reads with nobody touching it.",
    circuit: () => ledAndButton("D5"),
    speed: "fast",
    goals: [{ label: "The button pin reads LOW, then HIGH when pressed", check: (s) => Object.values(s.seen).some((v) => v.low && v.high) }],
    payoff: "This board pulls GPIO 5 up to 3V3 itself, because the chip checks that pin when it boots, and the board's pull-up beats INPUT_PULLDOWN. Move the button to a plain pin like D19 and change the code to match.",
    code: `int pushButton = 5;
int ledPin = 2;
bool state = false;

void setup() {
  pinMode(pushButton, INPUT_PULLDOWN);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  if (digitalRead(pushButton) == HIGH) {
    state = !state;
    digitalWrite(ledPin, state);
    while (digitalRead(pushButton) == HIGH);
    delay(500);
  }
}
`,
  },
  {
    id: "bug-quotes",
    group: "Bug hunts",
    title: "Code that won't start",
    intro: "This was copied out of a document, and it won't even start. Read the message, then press Edit to fix it.",
    circuit: ledOnly,
    goals: [{ label: "Get it running", check: (s) => s.simMs > 300 }],
    payoff: "Word processors swap straight quotes for curly ones. The code looks right to people, but it isn't valid code.",
    code: `int LED_PIN = 2;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  Serial.println(“on”);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  Serial.println(“off”);
  delay(1000);
}
`,
  },
  {
    id: "bug-4095",
    group: "Bug hunts",
    title: "The fade that sticks",
    intro: "This fade takes ages: it brightens quickly, then sits at full for a long time. The loop counts much further than analogWrite can go.",
    circuit: ledOnly,
    speed: "real",
    goals: [{ label: "A smooth fade, every value between 0 and 255", check: (s) => s.cleanSweeps > 0 }],
    payoff: "analogWrite takes 0 to 255. analogRead gives 0 to 4095. The two ranges differ, and mixing them up is one of the most common bugs.",
    code: `int LED_PIN = 2;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  for (int i = 0; i <= 4095; i++) {
    analogWrite(LED_PIN, i);
    delay(2);
  }
  for (int i = 4095; i >= 0; i--) {
    analogWrite(LED_PIN, i);
    delay(2);
  }
}
`,
  },

  // ── Projects ─────────────────────────────────────────────────────────
  {
    id: "multiplex",
    group: "Projects",
    title: "Two displays, nine wires",
    intro: "Both displays share seven segment wires. The code lights the left one, then the right, 100 times a second, so your eye sees both. Switch to Slow to see the trick.",
    circuit: multiplexWired,
    speed: "real",
    tries: ["Switch to Slow", "Drag leftDigit and rightDigit", "Drag delay(5) up to 40 and watch it start to flicker"],
    code: `// Seven segment pins, shared by both displays: a b c d e f g
const int SEGMENTS[7] = {13, 12, 14, 27, 26, 25, 33};
const int LEFT_GROUND = 32;    // LOW lights the left display
const int RIGHT_GROUND = 4;    // LOW lights the right display

// Which segments make each digit, 0 to 9
const int DIGITS[10][7] = {
  {1, 1, 1, 1, 1, 1, 0},
  {0, 1, 1, 0, 0, 0, 0},
  {1, 1, 0, 1, 1, 0, 1},
  {1, 1, 1, 1, 0, 0, 1},
  {0, 1, 1, 0, 0, 1, 1},
  {1, 0, 1, 1, 0, 1, 1},
  {1, 0, 1, 1, 1, 1, 1},
  {1, 1, 1, 0, 0, 0, 0},
  {1, 1, 1, 1, 1, 1, 1},
  {1, 1, 1, 1, 0, 1, 1}
};

int leftDigit = 4;
int rightDigit = 2;

void setup() {
  for (int i = 0; i < 7; i++) {
    pinMode(SEGMENTS[i], OUTPUT);
  }
  pinMode(LEFT_GROUND, OUTPUT);
  pinMode(RIGHT_GROUND, OUTPUT);
}

void show(int digit) {
  for (int i = 0; i < 7; i++) {
    digitalWrite(SEGMENTS[i], DIGITS[digit][i]);
  }
}

void loop() {
  digitalWrite(RIGHT_GROUND, HIGH);   // right display off
  show(leftDigit);
  digitalWrite(LEFT_GROUND, LOW);     // left display on
  delay(5);

  digitalWrite(LEFT_GROUND, HIGH);    // left display off
  show(rightDigit);
  digitalWrite(RIGHT_GROUND, LOW);    // right display on
  delay(5);
}
`,
  },
  {
    id: "classifier",
    group: "Projects",
    title: "A classifier that learns",
    intro: "Teach it by example. Turn the knob to where \"off\" should be and press the button, three times. Then do the same for \"on\" three times. After that it decides on its own.",
    circuit: () => [...ledAndButton(), ...knob()],
    speed: "fast",
    panel: "classifier",
    tries: ["Teach it OFF around 1000 and ON around 3000, then sweep the knob", "Teach it backwards: ON low, OFF high"],
    code: `// Learns "off" and "on" from examples, then decides for itself.
const int POT = 34;
const int LED = 2;
const int BUTTON = 19;

int reading = 0;
float offTotal = 0;
int offCount = 0;
float onTotal = 0;
int onCount = 0;

void setup() {
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLDOWN);
  Serial.begin(115200);
}

void loop() {
  reading = analogRead(POT);

  // Training: each press is one example.
  // The first three are OFF, the next three are ON.
  if (digitalRead(BUTTON) == HIGH) {
    if (offCount < 3) {
      offTotal += reading;
      offCount++;
      Serial.println("learned an OFF example");
    } else if (onCount < 3) {
      onTotal += reading;
      onCount++;
      Serial.println("learned an ON example");
    }
    while (digitalRead(BUTTON) == HIGH);   // wait for the release
  }

  // Deciding: which average is this reading closer to?
  if (offCount > 0 && onCount > 0) {
    float offAverage = offTotal / offCount;
    float onAverage = onTotal / onCount;
    if (abs(reading - onAverage) < abs(reading - offAverage)) {
      digitalWrite(LED, HIGH);
    } else {
      digitalWrite(LED, LOW);
    }
  }
  delay(20);
}
`,
  },
];
