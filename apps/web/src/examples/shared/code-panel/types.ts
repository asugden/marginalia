// The shape of an example's optional code view.
//
// An example that offers code ships one or more *versions* (two ways of
// writing the same model, say), and each version is a list of *sections*.
// A section is one box: a few lines of code, what they do, and which part
// of the figure they build. Only one box is open at a time, popped up beside
// the part the reader clicked, so each is read next to what it builds and
// the program is never on screen as one block to copy.
//
// Region names are the example's own (an MLP uses "w1", "h1", ...); this
// module never interprets them, it only passes them between the figure and
// the boxes.

export interface CodeSection {
  /** Stable id, unique within its version. */
  id: string;
  /** Short heading for the box. */
  title: string;
  /** The code, verbatim. Leading/trailing blank lines are trimmed. */
  code: string;
  /**
   * What the code does, in plain prose. Blank lines separate paragraphs;
   * `backticks` mark inline code.
   */
  explain: string;
  /** Optional one-line shape/size note, shown in a chip under the code. */
  shape?: string;
  /**
   * The parts of the figure this box builds. The box opens from a button
   * on the first of them; while it is open they stay lit and the rest of
   * the figure dims. Empty: its button sits under the figure instead.
   */
  over: string[];
  /**
   * Further parts to light while this box is open, without giving it a
   * button there (a training loop touches every weight, but a weight's
   * button should still open that weight's own box).
   */
  alsoLights?: string[];
}

export interface CodeVersion {
  id: string;
  /** Label in the version dropdown. */
  label: string;
  sections: CodeSection[];
}
