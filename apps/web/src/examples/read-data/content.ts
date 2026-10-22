// Everything the Reading data example says — edit freely.
//
// This file is content, not logic. The page computes every value it shows
// (what `split` returns, what `int` makes of a cell, what pandas would print)
// from the CSV text below, so if you change the data the results follow.
//
// Prose fields accept `backticks` for inline code and *asterisks* for a term
// being introduced; a blank line starts a new paragraph. Lines starting "1."
// or "-" are a list, drawn tight even with blank lines between items.

// The file. The same visitors as the machine-learning overview's spreadsheet.
export const FILE_NAME = "visitors.csv";
export const CSV = `time on page,device,past clicks,hour,clicked
14s,phone,3,21,yes
2s,laptop,0,09,no
47s,phone,1,22,yes
8s,laptop,2,13,no
31s,phone,0,19,yes
`;

export const LEDE = `
Before a model can learn anything, the data has to get from a file into
Python. This page follows one small file all the way in, and on the way meets
the handful of ideas every notebook rests on: imports, libraries, functions,
parentheses, and the difference between a string and a number.`;

// Hover text for words in the code. Keys are exactly as they appear in the
// code; a word missing here simply has no tooltip. Keep each under about 50
// characters: the tooltip is one line, and longer text is cut off.
export const TOOLTIPS: Record<string, string> = {
  "(": "Run the function before it. Inside: its input.",
  ")": "Run the function before it. Inside: its input.",
  ".": "Reach inside: f.read is the file's own read.",
  "=": "Store the right side under the name on the left.",
  import: "Bring a library into this notebook.",
  as: "Give what was imported a short nickname.",
  pandas: "A library for tables, written by others.",
  pd: "The usual nickname for pandas.",
  read_csv: "pandas: read a CSV file into a table.",
  open: "Get a handle to a file, not its contents.",
  read: "Read the whole file into one string.",
  close: "Let go of the file.",
  splitlines: "Cut a string into a list of lines.",
  split: "Cut a string wherever the separator appears.",
  int: "Turn a string of digits into a number.",
  len: "Count the characters, or the items in a list.",
  def: "Name a group of steps. Nothing runs yet.",
  return: "Hand this value back to the caller.",
  for: "Repeat the indented lines for each item.",
  in: "Take each item from this list in turn.",
  append: "Add one item to the end of a list.",
  path: "The input: whatever goes in ( ) on a call.",
  f: "The handle to the open file.",
  text: "The whole file, as one string.",
  lines: "A list of strings, one per line.",
  line: "One line of the file, as a string.",
  header: "The column names.",
  row: "One visitor's cells.",
  clicks: "One cell, as a number.",
  rows: "A list holding one list of cells per line.",
  read_rows: "Our own CSV reader, defined on this page.",
  df: "The table pandas made (a DataFrame).",
  dtypes: "The type pandas chose for each column.",
};

// ── Panel 1 ────────────────────────────────────────────────────────────
export const FILE_PANEL = {
  title: "A file is just text",
  standfirst: `
This is \`visitors.csv\`, the spreadsheet from the overview, as it is saved.
Point at a cell in either view to find it in the other.`,
  hiddenSwitch: "Show line breaks",
  fileLabel: "The file",
  sheetLabel: "As a spreadsheet",
  note: `
CSV stands for *comma-separated values*. There are no columns or cells in the
file, only characters: a comma ends a cell and a line break (\`\\n\`) ends a
row. The first line holds the column names.`,
};

// ── Panel 2 ────────────────────────────────────────────────────────────
export const PARENS_PANEL = {
  title: "Parentheses mean go",
  standfirst: `
A name on its own only points at something. Put parentheses after it and Python
runs it. Pick each pair and compare what comes back.`,
  resultLabel: "Python gives back",
  note: `
Inside the parentheses go the function's inputs: \`open("visitors.csv")\`
opens that file, \`len(text)\` counts that text. A function that needs no input
still needs its parentheses to run: \`f.read()\`.`,
};

/** Each pair names a function, then runs it. The code is fixed (the page
 *  computes its result); the notes are yours. */
export const PARENS_PAIRS: {
  name: string;
  called: string;
  nameNote: string;
  calledNote: string;
}[] = [
  {
    name: "f.read",
    called: "f.read()",
    nameNote: "The read function itself. Nothing has been read.",
    calledNote: `
Run: the whole file as one string. Run it a second time and you get \`''\`, an
empty string, because the file has already been read to the end. Open it again
to start over.`,
  },
  {
    name: "len",
    called: "len(text)",
    nameNote: "The len function itself, waiting for something to count.",
    calledNote: "Run on the file's text: how many characters it holds, line breaks included.",
  },
  {
    name: "text.splitlines",
    called: "text.splitlines()",
    nameNote: "The splitlines function that belongs to text. Nothing has been split.",
    calledNote: "Run: the text cut into a list of lines, one string per row of the file.",
  },
];

// ── Panel 3 ────────────────────────────────────────────────────────────
export const STEPS_PANEL = {
  title: "Reading it with plain Python",
  standfirst: `
Step through the lines that read the file. Watch what each one makes, and
what kind of thing it is.`,
  back: "Back",
  next: "Next",
  varsLabel: "Names so far",
  note: `
Every cell comes out of the file as a string, numbers included: \`'3'\` is in
quotes. Only \`int\` in the last step turns one into a number.`,
};

/** One line per step, in order. The page computes each line's value from
 *  its exact code, so change `code` only alongside the page; `explain` is
 *  shown when the step is reached and is yours to edit. */
export const STEPS: { code: string; explain: string }[] = [
  {
    code: `f = open("visitors.csv")`,
    explain: `
\`open\` finds the file and hands back a *handle*: a way to reach the file,
not its contents. Nothing has been read yet.`,
  },
  {
    code: `text = f.read()`,
    explain: `
\`read\` pulls in the whole file as one long *string*: every character in
order, with \`\\n\` where each line ended.`,
  },
  {
    code: `f.close()`,
    explain: `
Done with the file, so let it go. The text is already stored in \`text\`;
closing the file does not change it.`,
  },
  {
    code: `lines = text.splitlines()`,
    explain: `
Cut the text at every line break. The result is a *list* of strings, one per
row of the spreadsheet. The first is the header.`,
  },
  {
    code: `header = lines[0].split(",")`,
    explain: `
\`lines[0]\` is the first line (Python counts from 0). \`split(",")\` cuts it
at every comma, giving the column names.`,
  },
  {
    code: `row = lines[1].split(",")`,
    explain: `
The same cut on the first visitor. Look closely: \`'3'\` and \`'21'\` are in
quotes. They are strings, not numbers.`,
  },
  {
    code: `clicks = int(row[2])`,
    explain: `
\`row[2]\` is the third cell, \`'3'\`. \`int\` turns it into the number \`3\`,
something you can add, compare and average.`,
  },
];

// ── Panel 4 ────────────────────────────────────────────────────────────
export const TYPES_PANEL = {
  title: "Strings and numbers",
  standfirst: `
\`"3"\` is a string: the character three. \`3\` is a number. Change each side
and the operator, and see what Python makes of them.`,
  leftLabel: "Left",
  rightLabel: "Right",
  opLabel: "Operator",
  resultLabel: "Result",
  tryTitle: "Which cells can be numbers?",
  tryStandfirst: `
\`int\` only works on a string that is all digits. Try it on cells from the
file.`,
  note: `
Quotes are how to tell them apart: Python shows a string in quotes and a
number without. Data as it was collected (\`14s\`, \`phone\`) is mostly
strings; turning it into numbers a model can read is a step you choose.`,
};

/** The cells offered to `int(...)`. They must appear in the CSV. */
export const TRY_CELLS = ["3", "09", "14s", "phone", "yes"];

// ── Panel 5 ────────────────────────────────────────────────────────────
export const FUNCTION_PANEL = {
  title: "A function collects the steps",
  standfirst: `
Retyping those lines for every file gets old. \`def\` gathers them under one
name. Pick what to run.`,
  resultLabel: "What happens",
  note: `
\`path\` is a placeholder: it stands for whatever goes in the parentheses when
the function is called, so the same function reads any file shaped like this
one.`,
};

export const FUNCTION_CODE = `def read_rows(path):
    f = open(path)
    lines = f.read().splitlines()
    f.close()
    rows = []
    for line in lines[1:]:
        rows.append(line.split(","))
    return rows`;

export const FUNCTION_CHOICES: { code: string | null; label: string; note: string }[] = [
  {
    code: null,
    label: "Only the def",
    note: `
Nothing is read and nothing is printed. Python has only learned the name
\`read_rows\` and the steps it stands for.`,
  },
  {
    code: "read_rows",
    label: "read_rows",
    note: "The function itself, named but not run. No parentheses, no go.",
  },
  {
    code: `rows = read_rows("visitors.csv")`,
    label: `read_rows("visitors.csv")`,
    note: `
Run: every step inside the def happens, with \`path\` standing for
\`"visitors.csv"\`. Back comes one list of cells per visitor, all strings.`,
  },
];

// ── Panel 6 ────────────────────────────────────────────────────────────
export const LIBRARY_PANEL = {
  title: "A library is functions someone else wrote",
  standfirst: `
pandas is a *library*: thousands of functions like \`read_rows\`, written and
tested by other people. \`import\` brings them into your notebook.`,
  without: "Without the import",
  with: "With the import",
  resultLabel: "What happens",
  typesLabel: "Column types",
  note: `
\`read_csv\` did what \`read_rows\` did, then went further: it named the
columns, numbered the rows, and turned every column that looks like numbers
into numbers (\`int64\`). \`09\` became \`9\`. Columns with any letters stay
text (\`object\`), so \`14s\` is still a string.`,
};
