// Tooltips for the names in a sketch.
//
// Hovering one of these names in the code shows its text. Edit the text
// freely; an empty string turns that tooltip off. A name missing from this
// list simply has no tooltip.

export const TOOLTIPS: Record<string, string> = {
  // Every sketch
  setup: "One-time setup function run at power-on.",
  loop: "Runs after setup, looping forever.",

  // Pins
  pinMode:
    "Set a pin/board connectoin to be an input or output (consider PULLUP or PULLDOWN).",
  digitalWrite: "Set an OUTPUT pin to 3.3 Volts (HIGH) or GND (LOW).",
  analogWrite: "Uses PWM to simulate an analog output from 0 - 255.",
  digitalRead: "Reads a digital pin as HIGH or LOW.",
  analogRead:
    "Reads an analog pin as a number from 0 (GND) to 4095 (3.3 Volts).",

  // Time
  delay: "Pause the loop for this many milliseconds (1000 per second).",
  delayMicroseconds:
    "Pause the loop for this many microseconds (1000 per millisecond).",
  millis: "Number of milliseconds since the board was powered.",
  micros: "Number of microseconds since the board was powered.",

  // Serial
  "Serial.begin": "Connect to the computer for printing (check baud rate).",
  "Serial.print": "Print text on the computer.",
  "Serial.println":
    "Print text on the computer followed by an enter/return/new line.",

  // Numbers
  abs: "Absolute value",
  min: "Minimum of two numbers",
  max: "Maximum of two numbers",
  constrain: "Keep a value between a low and high limit",
  map: "Re-scale a number from one range to another",
  sq: "The number squared",
  sqrt: "The square root of the number.",
  pow: "The first number to the power of the second",
  random: "A random whole number (no decimal)",
  randomSeed: "Re-start random from here",
};
