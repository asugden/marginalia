// Tooltips for the names in a sketch.
//
// Hovering one of these names in the code shows its text. Edit the text
// freely; an empty string turns that tooltip off. A name missing from this
// list simply has no tooltip.

export const TOOLTIPS: Record<string, string> = {
  // Every sketch
  setup: "Runs once, when the board powers on.",
  loop: "Runs over and over, forever, after setup() finishes.",

  // Pins
  pinMode: "Gets a pin ready: pinMode(pin, INPUT or OUTPUT).",
  digitalWrite: "Sets an output pin HIGH (on) or LOW (off).",
  analogWrite: "Flickers an output pin fast: 0 is off, 255 is fully on.",
  digitalRead: "Reads a pin: HIGH or LOW.",
  analogRead: "Reads a voltage on a pin as a number from 0 to 4095.",

  // Time
  delay: "Waits this many milliseconds. Nothing else runs meanwhile.",
  delayMicroseconds: "Waits this many microseconds (millionths of a second).",
  millis: "Milliseconds since the board powered on.",
  micros: "Microseconds since the board powered on.",

  // Serial
  "Serial.begin": "Opens the connection to the computer at this speed.",
  "Serial.print": "Sends text to the computer.",
  "Serial.println": "Sends text to the computer, then starts a new line.",

  // Numbers
  abs: "The number without its minus sign.",
  min: "The smaller of two numbers.",
  max: "The larger of two numbers.",
  constrain: "Keeps a number between a low and a high limit.",
  map: "Rescales a number from one range to another.",
  sq: "A number times itself.",
  sqrt: "The square root of a number.",
  pow: "A number raised to a power.",
  random: "A random whole number.",
  randomSeed: "Starts random() from a different place.",
};
