# Example: Breadboards and Loops

A breadboard sandbox with a guided tour over it. Mounted at `/examples/wiring`.
There is no backend: everything is recomputed from the parts on the board
whenever anything changes.

## Who it is for

Beginners who want to build connected things and have little interest in
electronics for its own sake. The aim is to make the wiring feel easy
enough that their attention goes to what they are making. It is a place to
play and poke at things, not a lesson: every idea gets a puzzle, and no idea
gets a paragraph.

## What it teaches

- **A circuit is a loop.** It runs from a power pin, through the load, and
  back to GND. Break the loop anywhere and it all goes dark.
- **A breadboard hides wires.** X-ray draws the metal strips inside. Hovering
  a hole lights up everything joined to it, and *Colour by connection* gives
  each connected group its own colour. That colouring is the second kind of
  diagram, drawn from the student's own build.
- **The load and the resistor.** The LED is the load. With no resistor in its
  loop it burns out, with a pop and a counter to go with it. It makes no
  difference whether the resistor comes before the LED or after it.
- **A short is a short however far it wanders.** Power that reaches GND
  through wire alone shuts the board off, and the page traces the whole
  path, however long it is.
- **Pins, the way code sets them.** Select a pin to give it a mode, named as a
  sketch names it: `INPUT`, `INPUT_PULLDOWN`, `OUTPUT` (click the label to flip
  it HIGH and LOW) or PWM (a duty slider and its square wave). An input pin
  reads live. `digitalRead` shows HIGH, LOW, or a flicker when the pin is
  floating. `analogRead` shows a 0–4095 meter. The panel shows the matching
  line of code, so a later example can hand the pins to a real sketch.
- **Seven-segment displays** are common-ground, each segment an LED to a
  shared ground leg, with the legs named in X-ray. The hardest challenge
  wires two of them with nine wires: shared segment lines, and one ground
  pin per display. The code example's multiplexing sketch then drives
  exactly that circuit.
- **The potentiometer** is a knob you drag. It dims an LED, as a voltage
  divider or in series, and feeds an analog pin.

## Connection first, voltage second

`analyze.ts` works in two layers.

**Connection** comes first, and every explanation on the page comes from it.
It asks what is connected to what, using union-find for the connected groups
and breadth-first search for paths. That decides whether an LED is in a loop,
backwards, bypassed, open on one side, or waiting on a pin that is switched
off, and whether the board is shorted. A part needs only a line saying how
its legs connect.

**Voltage** is a small nodal solve over the same groups. It answers the three
things connection cannot: how bright an LED is, whether it takes enough
current to burn out, and what an input pin reads. Parts enter it only as
resistances (a resistor, the two halves of a potentiometer), an LED's forward
drop, and the board's fixed voltages. It stays one general mechanism rather
than a model per part, so adding a resistive part costs nothing. The
constants are round numbers of the right size, not a datasheet.

## Files

| File | What |
|---|---|
| `model.ts` | Geometry (holes, strips, the board's pins), part types, node ids |
| `analyze.ts` | The connection analysis and `describePath`, which reads a loop aloud |
| `challenges.ts` | The tour: each challenge is a starting board and a set of goals |
| `circuits.ts` | Part builders and stock circuits, shared with the code example |
| `Breadboard.tsx` | The SVG sandbox: drawing, snapping, dragging, pressing |
| `WiringPage.tsx` | Page state, tour card, readout, controls |

## The board

The development board is the common 30-pin ESP32 layout: USB at the left
end, and printed labels such as `D19`, `RX2` and `VP`. Boards differ in both
their printing and their pin order. The layout is data in `model.ts`
(`TOP_LABELS` / `BOTTOM_LABELS`), so a different board is a small edit.

## Adding a challenge

Add an entry to `CHALLENGES` with a `group`, a `setup()` that returns parts,
optional starting `pins`, and a list of `goals`. A goal is checked against
the live analysis, and once met it stays met. A check can re-run the
analysis on a variant of the circuit, such as buttons held or a knob at
either end, so a goal can test behaviour ("lit only while held"), not just
one moment. Set `hideShortPath` where finding the short is the puzzle. The
challenges appear in a menu and can be taken in any order.

## Known gaps

- PWM is shown averaged. The LED looks dimmer, and the flicker behind that is
  shown only by the square wave in the pin panel.
- The ESP32's ADC is treated as linear, and ADC2 pins read even with WiFi on.
  Neither is true of real hardware.
- The board sits off the breadboard, with jumper wires to its pins. Plugging
  it straight into the breadboard is not modelled.
- The figure is drawn at 1:1 at 680 units wide. It works on a phone, but a
  laptop is the intended screen.
