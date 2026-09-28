# Example: Reading a Sketch

A microcontroller sketch running line by line on the wiring example's board.
Mounted at `/examples/code`. There is no backend: the page parses the
sketch, interprets it, and drives the simulated circuit.

## Who it is for

Beginners who increasingly get their code from a chat assistant. The page
teaches them to *read* a sketch and build an intuition for five things:

- **setup()** runs once, and **loop()** runs forever.
- **Inputs** are lines where code reads the board.
- **Outputs** are lines where code acts on the board.
- **Control** lines decide what runs next.
- **Time** lines wait for something or check the clock.

## The annotations

Everything is drawn on code that is really running.

- **Role colours.** Each line gets a bar and glyphs for its job: setup ⚙,
  output →, input ←, control ?, time ◷, serial ✉. The same colours are used
  for call names and threads.
- **The track.** Power on, then setup(), which runs once, then loop() as a
  ring with a moving dot and a lap counter. setup()'s lines grey out once it
  has run. A loop stuck waiting stops the lap counter, which is the point of
  the button-toggle critique.
- **Live values.** The value each line last produced appears beside it:
  `potValue = 2047`, `LOW == HIGH → false`, `D2 → HIGH`.
- **Threads.** A curve runs from each line that touched a pin to that pin's
  label on the board: solid for outputs, dashed for inputs. Hovering a line
  shows its threads. Change a pin number and the thread moves, which makes a
  code/wiring mismatch visible. *Code to pins* turns them off, since they
  cross the live values. With the diagram on, they end at the pin's label
  in the diagram.
- **No end-of-line comments.** The sketches carry no trailing `//`
  comments: the live values sit in that space and say more.
- **Adjustable values.** Numbers can be dragged. HIGH/LOW and true/false can
  be clicked. A literal inside loop() changes live. One in a global or in
  setup() restarts the board, because that is when it takes effect.
- **Goals and things to try tick themselves.** Each has a check on what
  the running sketch does (a delay's length, which pin lit an LED, laps
  finished with a button held), never on the code's text, so dragging a
  number and editing it by hand count the same. A check can keep a small
  memory that outlasts edits and power cycles, for steps done in order
  ("2, then 40"). A check only sees code that has run: at Step, a change
  counts once its line has been stepped through.
- **Dragging numbers.** Each 60 px of drag is a power of ten, so 1000 → 100
  is a short drag. Values land on round numbers: every whole number under
  20, then steps of 5 to 100, 10 to 200, 50 to 1000, and so on.
- **Tooltips.** Hovering a function's name in the code (`digitalWrite`,
  `delay`, `setup` …) shows what it does. The text is all in `tooltips.ts`,
  one line per name, to be edited by hand.
- **Plain English** (hidden for now). An optional translation under each
  line, generated from a small rule set (`english.ts`). It leaves a line
  blank rather than guess. `SHOW_PLAIN_ENGLISH` in `CodePage.tsx` brings
  its switch back.
- **delay() is blind.** A delay line fills while it waits. A button change
  during the wait is flagged *missed* on that line.
- **Serial monitor.** Hovering a printed line highlights the code that
  printed it.
- **Classifier panel.** For the classifier sketch, a number line drawn from
  the sketch's own variables: its examples, class averages, the boundary
  between them, and the knob's current position.

## How it runs

| File | What |
|---|---|
| `lang.ts` | Lexer and parser for the beginner slice of Arduino C++, with a literal table and per-line roles |
| `run.ts` | A generator interpreter: it yields before every statement and at every delay |
| `runner.ts` | Pacing, simulated time, the board bridge, persistence of vision, stats for goals |
| `english.ts` | The plain-English column (hidden for now) |
| `tooltips.ts` | The tooltip for each function name, edited by hand |
| `sketches.ts` | The sketches, their circuits, their goals, and their things to try, each with the check that ticks it |
| `CodeView.tsx` / `CodePage.tsx` | The page |

**Pacing.** Step runs one line per click with the clock stopped. Slow and
Fast spend a fixed stretch of real time on each line, with the clock running
at real speed, so `millis()` and `delay()` keep their meaning. Real time runs
lines at roughly 20 µs each. Every sketch starts on Step, so nothing moves
until the reader asks it to.

**Persistence of vision.** In Real time, each frame totals how long each pin
configuration lasted and shows every LED at its time-weighted brightness,
with a perceptual curve applied. A multiplexed pair of displays therefore
shows both digits, and in Slow the flashing becomes visible.

**What it doesn't understand.** Pointers, structs, classes, String methods,
and libraries such as WiFi. Each stops the sketch with a message naming
what the page met, never a guess.

## Sketches

- **Walkthroughs:** blink, a toggle that freezes the board, a toggle that
  never waits, reading a knob, fading, and a knob that dims an LED.
- **Timing:** `delay()` missing presses, then the `millis()` version
  catching them.
- **Bug hunts:** a pin that doesn't match the wiring, a floating input, a
  boot pin the board pulls up (GPIO 5), curly quotes, and `analogWrite`
  pushed to 4095.
- **Projects:** two displays on nine wires (multiplexing), and a
  nearest-average classifier taught by button presses.

Circuits come from `../wiring/circuits.ts`, so a circuit built by hand in the
wiring example is the one the code drives here.
