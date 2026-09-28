// The code example (/examples/code).
//
// A sketch on the left, running on the wiring example's board on the right.
// Students increasingly get their code from a chat assistant, so the page is
// about reading a sketch, not writing one: what runs once and what repeats,
// which lines reach out to the board and which listen to it, what decides,
// what waits. The tools for that are all annotations on code that is really
// running — role colours, live values, a plain-English line, a track showing
// setup() then loop() going round, and threads from each pin number in the
// code to the pin it names on the board.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Dropdown,
  Switch,
  Wordmark,
} from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import { Breadboard, type Tool } from "../wiring/Breadboard.js";
import { DiagramControls, type DiagramMode } from "../wiring/Diagram.js";
import { PIN_BY_ID, type Part } from "../wiring/model.js";
import "../wiring/wiring.css";
import "./code.css";
import { CodeView, ROLE_INFO, ROLE_ORDER } from "./CodeView.js";
import { explain } from "./english.js";
import { LangError, parse, type Program } from "./lang.js";
import { Runner, type Speed } from "./runner.js";
import { SKETCHES, type Memo, type Sketch } from "./sketches.js";

/** Plain English is hidden for now; the function names carry tooltips
 *  instead (tooltips.ts). Set true to bring the switch back. */
const SHOW_PLAIN_ENGLISH = false;

const SPEEDS: Array<{ id: Speed; label: string; hint: string }> = [
  { id: "step", label: "Step", hint: "Click to advance one line" },
  { id: "slow", label: "Slow", hint: "Two lines per second" },
  { id: "fast", label: "Fast", hint: "16 lines per second" },
  { id: "real", label: "Real time", hint: "As fast as the ESP32" },
];

function tryParse(src: string): {
  prog: Program | null;
  error: LangError | null;
} {
  try {
    return { prog: parse(src), error: null };
  } catch (e) {
    return {
      prog: null,
      error: e instanceof LangError ? e : new LangError(String(e), 1),
    };
  }
}

export function CodePage() {
  const [idx, setIdx] = useState(0);
  const sketch = SKETCHES[idx]!;

  const [source, setSource] = useState(sketch.code);
  const [parsed, setParsed] = useState(() => tryParse(sketch.code));
  const [parts, setParts] = useState<Part[]>(() => sketch.circuit());
  const runner = useRef<Runner | null>(null);
  const [, setFrame] = useState(0);

  // Every sketch starts on Step: code running by itself from the first
  // moment is a lot to take in.
  const [speed, setSpeed] = useState<Speed>("step");
  const [paused, setPaused] = useState(false);
  const [editing, setEditing] = useState(!parsed.prog);
  const [draft, setDraft] = useState(sketch.code);
  const [english, setEnglish] = useState(false);
  const [threads, setThreads] = useState(true);
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const [litText, setLitTextState] = useState<Map<number, string>>(new Map());
  // Mirrored in a ref: a click on HIGH/LOW changes and commits in one event,
  // before a re-render could deliver the new text.
  const litRef = useRef(litText);
  const setLitText = (
    m: Map<number, string> | ((m: Map<number, string>) => Map<number, string>),
  ) => {
    const next = typeof m === "function" ? m(litRef.current) : m;
    litRef.current = next;
    setLitTextState(next);
  };

  const [tool, setTool] = useState<Tool>("move");
  const [xray, setXray] = useState(false);
  const [diagram, setDiagram] = useState<DiagramMode>("off");
  const [selected, setSelected] = useState<string | null>(null);

  const [met, setMet] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState<Set<string>>(new Set());
  // Things to try, done: ticked by their checks, and kept.
  const [tried, setTried] = useState<Set<number>>(new Set());
  // Each try's memory, for as long as the sketch is open.
  const memos = useRef<Memo[]>([]);
  // Sketches where a button has been held for a second, for tries that
  // compare one sketch with another.
  const [heldIn, setHeldIn] = useState<Set<string>>(new Set());

  const layoutRef = useRef<HTMLDivElement>(null);

  // ── Loading ──────────────────────────────────────────────────────────

  const start = useCallback((prog: Program | null, circuit: Part[]) => {
    if (!prog) {
      runner.current = null;
      return;
    }
    if (runner.current) {
      runner.current.setParts(circuit);
      runner.current.load(prog, prog.lits);
    } else runner.current = new Runner(prog, prog.lits, circuit);
  }, []);

  const loadSketch = useCallback(
    (i: number) => {
      const sk = SKETCHES[i]!;
      const p = tryParse(sk.code);
      const circuit = sk.circuit();
      setIdx(i);
      setSource(sk.code);
      setDraft(sk.code);
      setParsed(p);
      setParts(circuit);
      setEditing(!p.prog);
      setSpeed("step");
      setPaused(false);
      setLitText(new Map());
      setMet(new Set());
      setTried(new Set());
      memos.current = [];
      setSelected(null);
      start(p.prog, circuit);
    },
    [start],
  );

  // First load.
  useEffect(() => {
    start(parsed.prog, parts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (runner.current) runner.current.speed = speed;
  }, [speed]);
  useEffect(() => {
    if (runner.current) runner.current.paused = paused || editing;
  }, [paused, editing]);

  // ── The clock ────────────────────────────────────────────────────────

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      runner.current?.tick(dt);
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const r = runner.current;

  // ── Goals ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!r || !sketch.goals?.length) return;
    let changed = false;
    const next = new Set(met);
    sketch.goals.forEach((g, i) => {
      if (!next.has(i) && g.check(r.stats)) (next.add(i), (changed = true));
    });
    if (changed) {
      setMet(next);
      if (next.size === sketch.goals.length)
        setFinished((f) => new Set(f).add(sketch.id));
    }
  });
  const complete = !!sketch.goals?.length && met.size === sketch.goals.length;

  // ── Things to try ────────────────────────────────────────────────────

  useEffect(() => {
    if (!r) return;
    if (r.stats.heldMs >= 1000 && !heldIn.has(sketch.id)) setHeldIn((h) => new Set(h).add(sketch.id));
    if (!sketch.tries?.length) return;
    const watch = {
      stats: r.stats,
      speed: r.speed,
      peek: (name: string) => r.peek(name),
      parts,
      analysis: r.display,
      heldIn,
    };
    let changed = false;
    const next = new Set(tried);
    sketch.tries.forEach((t, i) => {
      if (next.has(i)) return;
      const memo = (memos.current[i] ??= {});
      if (t.check(watch, memo)) (next.add(i), (changed = true));
    });
    if (changed) setTried(next);
  });

  // ── Editing ──────────────────────────────────────────────────────────

  const runDraft = () => {
    const p = tryParse(draft);
    setParsed(p);
    if (!p.prog) return;
    setSource(draft);
    setLitText(new Map());
    setEditing(false);
    start(p.prog, parts);
  };

  const onLitChange = (i: number, value: number, text: string) => {
    const lit = runner.current?.lits[i];
    if (lit) lit.value = value;
    setLitText((m) => new Map(m).set(i, text));
  };

  /** Write a dragged literal back into the source. A literal in a global or
   *  in setup() only takes effect from power-on, so those restart. */
  const onLitCommit = (i: number) => {
    const prog = parsed.prog;
    const text = litRef.current.get(i);
    if (!prog || text === undefined) return;
    const lit = prog.lits[i]!;
    const next = source.slice(0, lit.start) + text + source.slice(lit.end);
    const p = tryParse(next);
    if (!p.prog) return;
    setSource(next);
    setDraft(next);
    setParsed(p);
    setLitText(new Map());
    if (lit.scope === "" || lit.scope === "setup") start(p.prog, parts);
    else if (runner.current) {
      p.prog.lits.forEach(
        (l, k) => (l.value = runner.current!.lits[k]?.value ?? l.value),
      );
      runner.current.lits = p.prog.lits;
    }
  };

  const englishMap = useMemo(
    () => (english && parsed.prog ? explain(parsed.prog) : null),
    [english, parsed.prog],
  );

  const changeParts = (next: Part[]) => {
    setParts(next);
    runner.current?.setParts(next);
  };

  // ── Render ───────────────────────────────────────────────────────────

  const recentMissed =
    r?.missed
      .filter((m) => r.simMs - m.at < 2500)
      .map((m) => ({
        line: m.line,
        label: PIN_BY_ID.get(m.pin)?.label ?? "",
      })) ?? [];
  const selectedPart = parts.find((p) => p.id === selected);

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link
            to="/examples"
            className="app-lockup-link"
            aria-label="Examples"
          >
            <Wordmark size="sm" />
          </Link>
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="mnist-page cd-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Arduino Code</h1>
            <p className="mnist-lede">
              Arduino code can be hard to parse. Why void? What is the
              difference between setup and loop? We will show a few examples
              here and discuss what the steps mean. Start with{" "}
              <Link to="/examples/wiring">Breadboard Secrets</Link>.
            </p>
          </div>

          <SketchCard
            sketch={sketch}
            index={idx}
            met={met}
            tried={tried}
            finished={finished}
            complete={complete}
            onGo={loadSketch}
          />

          <div className="cd-layout" ref={layoutRef}>
            <Card padding="md" className="cd-codecard">
              <div className="wr-controls cd-controls">
                <div className="wr-controls__row">
                  <span className="wr-controls__label">Speed</span>
                  <div className="wr-controls__buttons">
                    {SPEEDS.map((s) => (
                      <Button
                        key={s.id}
                        size="sm"
                        variant={speed === s.id ? "primary" : "subtle"}
                        title={s.hint}
                        onClick={() => {
                          setSpeed(s.id);
                          if (s.id === "step") runner.current?.stepOnce();
                        }}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="wr-controls__row">
                  <span className="wr-controls__label">Run</span>
                  <div className="wr-controls__buttons">
                    {speed === "step" ? (
                      <Button
                        size="sm"
                        variant="subtle"
                        disabled={editing}
                        onClick={() => runner.current?.stepOnce()}
                      >
                        Next line
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="subtle"
                        disabled={editing}
                        onClick={() => setPaused((x) => !x)}
                      >
                        {paused ? "Play" : "Pause"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="subtle"
                      disabled={editing}
                      onClick={() => start(parsed.prog, parts)}
                    >
                      Power cycle
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() =>
                        editing
                          ? runDraft()
                          : (setDraft(source), setEditing(true))
                      }
                    >
                      {editing ? "Run this code" : "Edit"}
                    </Button>
                    {SHOW_PLAIN_ENGLISH && (
                      <Switch
                        label="Plain English"
                        checked={english}
                        onChange={(e) => setEnglish(e.currentTarget.checked)}
                      />
                    )}
                    <Switch
                      label="Code to pins"
                      checked={threads}
                      onChange={(e) => setThreads(e.currentTarget.checked)}
                    />
                  </div>
                </div>
              </div>

              {parsed.prog && !editing && (
                <Track runner={r} prog={parsed.prog} />
              )}

              {(parsed.error || r?.error) && (
                <div className="cd-error" role="alert">
                  <span className="wr-kicker">
                    {parsed.error ? "Won't start" : "Stopped"}
                  </span>
                  <p>{(parsed.error ?? r?.error)!.message}</p>
                  {!parsed.error && (
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => start(parsed.prog, parts)}
                    >
                      Power cycle
                    </Button>
                  )}
                </div>
              )}

              {editing || !parsed.prog ? (
                <textarea
                  className="cd-editor"
                  value={draft}
                  spellCheck={false}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={Math.max(14, draft.split("\n").length + 1)}
                  aria-label="Sketch code"
                />
              ) : (
                <CodeView
                  source={source}
                  prog={parsed.prog}
                  current={r && !r.error ? r.line : null}
                  setupDone={r?.machine.phase === "loop"}
                  notes={r?.notes ?? new Map()}
                  now={r?.simMs ?? 0}
                  delayLine={r?.delayLine ?? null}
                  delayProgress={r?.delayProgress() ?? null}
                  missed={recentMissed}
                  english={englishMap}
                  hoverLine={hoverLine}
                  litText={litText}
                  onHoverLine={setHoverLine}
                  onLitChange={onLitChange}
                  onLitCommit={onLitCommit}
                />
              )}

              <div className="cd-legend">
                {ROLE_ORDER.map((role) => (
                  <span
                    key={role}
                    className={`cd-legend__item cd-role--${role}`}
                  >
                    <span className={`cd-glyph cd-glyph--${role}`}>
                      {ROLE_INFO[role].glyph}
                    </span>
                    <b>{ROLE_INFO[role].name}</b> {ROLE_INFO[role].hint}
                  </span>
                ))}
              </div>

              <SerialMonitor runner={r} onHoverLine={setHoverLine} />
            </Card>

            <div className="cd-side">
              <Card padding="md" className="cd-boardcard">
                <div className="wr-controls cd-controls">
                  <div className="wr-controls__row">
                    <span className="wr-controls__label">Wiring</span>
                    <div className="wr-controls__buttons">
                      {(["wire", "move"] as Tool[]).map((t) => (
                        <Button
                          key={t}
                          size="sm"
                          variant={tool === t ? "primary" : "subtle"}
                          onClick={() => setTool(t)}
                        >
                          {t === "move" ? "Hand" : "Wire"}
                        </Button>
                      ))}
                      <Switch
                        label="X-ray"
                        checked={xray}
                        onChange={(e) => setXray(e.currentTarget.checked)}
                      />
                      <DiagramControls mode={diagram} onChange={setDiagram} />
                      {selectedPart && (
                        <>
                          {selectedPart.kind === "button" && (
                            <Button
                              size="sm"
                              variant="subtle"
                              onClick={() =>
                                changeParts(
                                  parts.map((p) =>
                                    p.id === selectedPart.id &&
                                    p.kind === "button"
                                      ? { ...p, turned: !p.turned }
                                      : p,
                                  ),
                                )
                              }
                            >
                              Turn 90°
                            </Button>
                          )}
                          {(selectedPart.kind === "led" ||
                            selectedPart.kind === "seg7") &&
                            [...(r?.burnt ?? [])].some((b) =>
                              b.startsWith(selectedPart.id),
                            ) && (
                              <Button
                                size="sm"
                                variant="subtle"
                                onClick={() =>
                                  runner.current?.replace(selectedPart.id)
                                }
                              >
                                Replace
                              </Button>
                            )}
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              changeParts(
                                parts.filter((p) => p.id !== selectedPart.id),
                              );
                              setSelected(null);
                            }}
                          >
                            Remove
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {r && (
                  <div className="wr-figure">
                    <Breadboard
                      circuit={{
                        parts,
                        pins: r.pins,
                        pressed: r.pressed,
                        burnt: r.burnt,
                      }}
                      analysis={r.display}
                      showShort
                      tool={tool}
                      wireColor="auto"
                      xray={xray}
                      netColors={false}
                      diagram={diagram}
                      selected={selected}
                      popping={r.popping}
                      onSelect={setSelected}
                      onAdd={(p) => changeParts([...parts, p])}
                      onChange={(id, patch) =>
                        changeParts(
                          parts.map((p) =>
                            p.id === id ? ({ ...p, ...patch } as Part) : p,
                          ),
                        )
                      }
                      onPress={(id, down) =>
                        runner.current?.setPressed(id, down)
                      }
                      onPinClick={() => {}}
                    />
                  </div>
                )}
              </Card>
              {sketch.panel === "classifier" && r && (
                <ClassifierPanel runner={r} />
              )}
            </div>

            {r && parsed.prog && !editing && threads && (
              <Threads container={layoutRef} runner={r} hoverLine={hoverLine} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── The sketch picker ──────────────────────────────────────────────────

function SketchCard({
  sketch,
  index,
  met,
  tried,
  finished,
  complete,
  onGo,
}: {
  sketch: Sketch;
  index: number;
  met: ReadonlySet<number>;
  tried: ReadonlySet<number>;
  finished: ReadonlySet<string>;
  complete: boolean;
  onGo: (i: number) => void;
}) {
  const options = SKETCHES.map((s, i) => ({
    value: String(i),
    triggerLabel: s.title,
    label: (
      <span className="wr-menu-item">
        <span className="wr-menu-item__group">{s.group}</span>
        <span>
          {finished.has(s.id) ? "✓ " : ""}
          {s.title}
        </span>
      </span>
    ),
  }));
  return (
    <Card
      padding="md"
      className={`cd-sketch${complete ? " wr-tour--done" : ""}`}
    >
      <div className="cd-sketch__pick">
        <span className="wr-kicker">{sketch.group}</span>
        <Dropdown
          value={String(index)}
          options={options}
          onChange={(v) => onGo(Number(v))}
          ariaLabel="Sketch"
          className="wr-tour__menu"
        />
      </div>
      <div className="cd-sketch__body">
        <p className="wr-tour__prompt">{sketch.intro}</p>
        {sketch.goals && (
          <ul className="wr-goals">
            {sketch.goals.map((g, i) => (
              <li
                key={i}
                className={met.has(i) ? "wr-goal wr-goal--met" : "wr-goal"}
              >
                <span className="wr-goal__box" aria-hidden="true">
                  {met.has(i) ? "✓" : ""}
                </span>
                {g.label}
              </li>
            ))}
          </ul>
        )}
        {sketch.tries && (
          <ul className="wr-goals">
            {sketch.tries.map((t, i) => (
              <li
                key={t.label}
                className={tried.has(i) ? "wr-goal wr-goal--met" : "wr-goal"}
              >
                <span className="wr-goal__box" aria-hidden="true">
                  {tried.has(i) ? "✓" : ""}
                </span>
                {t.label}
              </li>
            ))}
          </ul>
        )}
        {complete && sketch.payoff && (
          <p className="wr-tour__payoff">{sketch.payoff}</p>
        )}
      </div>
    </Card>
  );
}

// ── setup() once, then loop() round and round ──────────────────────────

function Track({ runner, prog }: { runner: Runner | null; prog: Program }) {
  const setup = prog.funcs.get("setup")!;
  const loop = prog.funcs.get("loop")!;
  const phase = runner?.machine.phase ?? "start";
  const line = runner?.machine.topLine ?? 0;
  const frac = (f: typeof setup) =>
    Math.max(
      0,
      Math.min(1, (line - f.line) / Math.max(1, f.body.endLine - f.line)),
    );

  const LX = 250;
  const LY = 34;
  const R = 26;
  let dot = { x: 14, y: LY };
  if (phase === "setup") dot = { x: 60 + frac(setup) * 110, y: LY };
  if (phase === "loop") {
    const a = -Math.PI / 2 + frac(loop) * Math.PI * 2;
    dot = { x: LX + Math.cos(a) * R, y: LY + Math.sin(a) * R };
  }
  return (
    <svg
      className="cd-track"
      viewBox="0 0 340 68"
      width={340}
      height={68}
      role="img"
      aria-label="Where the sketch is"
    >
      {/* The connecting lines go first, so the parts sit on top of them. */}
      <line x1={20} y1={LY} x2={56} y2={LY} className="cd-track__line" />
      <line x1={174} y1={LY} x2={LX - R} y2={LY} className="cd-track__line" />
      <circle
        cx={14}
        cy={LY}
        r={6}
        className={
          phase === "start"
            ? "cd-track__power cd-track__power--on"
            : "cd-track__power"
        }
      />
      <text x={14} y={60} className="fig-label">
        ON
      </text>
      <rect
        x={56}
        y={LY - 13}
        width={118}
        height={26}
        rx={6}
        className={
          phase === "loop"
            ? "cd-track__setup cd-track__setup--done"
            : "cd-track__setup"
        }
      />
      <text x={115} y={LY + 4} className="cd-track__label">
        setup() · once
      </text>
      <circle
        cx={LX}
        cy={LY}
        r={R}
        className={
          phase === "loop"
            ? "cd-track__loop cd-track__loop--on"
            : "cd-track__loop"
        }
      />
      <text x={LX} y={LY + 4} className="cd-track__label">
        loop()
      </text>
      <text x={LX + R + 10} y={LY - 4} className="cd-track__lap">
        lap
      </text>
      <text x={LX + R + 10} y={LY + 12} className="cd-track__lapnum">
        {runner?.machine.lap ?? 0}
      </text>
      <circle cx={dot.x} cy={dot.y} r={5} className="cd-track__dot" />
    </svg>
  );
}

// ── Threads from code to board ─────────────────────────────────────────

/** A curve from each line that touched a pin to that pin's label on the
 *  board: orange out, blue in. Drawn for lines that just ran, and for the
 *  line under the pointer. */
function Threads({
  container,
  runner,
  hoverLine,
}: {
  container: React.RefObject<HTMLDivElement>;
  runner: Runner;
  hoverLine: number | null;
}) {
  const svg = useRef<SVGSVGElement>(null);
  // Measured after every render and drawn straight into the SVG: the
  // positions come from the DOM, so they can't be known during render, and
  // keeping them in state would re-render forever.
  useLayoutEffect(() => {
    const root = container.current;
    const el = svg.current;
    if (!root || !el) return;
    const box = root.getBoundingClientRect();
    // Threads leave from the code box's edge, not from inside the code.
    const codeRight = root.querySelector(".cd-code")?.getBoundingClientRect().right;
    const recent = runner.speed === "real" ? 350 : 900;
    let html = "";
    for (const [line, marks] of runner.io) {
      const lineEl = root.querySelector<HTMLElement>(
        `[data-line="${line}"] .cd-text`,
      );
      if (!lineEl) continue;
      for (const m of marks) {
        const age = runner.simMs - m.at;
        const hot = age < recent || line === runner.line;
        if ((!hot && line !== hoverLine) || !m.pin) continue;
        // The pin's label in the diagram when it is showing, else on the board.
        const pinEl =
          root.querySelector<SVGGElement>(
            `.wr-dg [data-pin="${m.pin}"] rect`,
          ) ?? root.querySelector<SVGGElement>(`[data-pin="${m.pin}"] rect`);
        if (!pinEl) continue;
        const a = lineEl.getBoundingClientRect();
        const b = pinEl.getBoundingClientRect();
        const x1 = (codeRight ?? a.right) - box.left;
        const y1 = a.top + a.height / 2 - box.top;
        const x2 = b.left + b.width / 2 - box.left;
        const y2 = b.top + b.height / 2 - box.top;
        const mid = (x1 + x2) / 2;
        const o = line === hoverLine ? 1 : Math.max(0.25, 1 - age / recent);
        html += `<path d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" class="cd-thread cd-thread--${m.dir}" style="opacity:${o.toFixed(2)}"/>`;
        html += `<circle cx="${x2}" cy="${y2}" r="4" class="cd-thread-end cd-thread-end--${m.dir}" style="opacity:${o.toFixed(2)}"/>`;
      }
    }
    el.innerHTML = html;
  });
  return <svg ref={svg} className="cd-threads" aria-hidden="true" />;
}

// ── The serial monitor ─────────────────────────────────────────────────

function SerialMonitor({
  runner,
  onHoverLine,
}: {
  runner: Runner | null;
  onHoverLine: (l: number | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const n = runner?.serial.length ?? 0;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [n]);
  return (
    <div className="cd-serial">
      <span className="wr-kicker">Serial monitor</span>
      <div
        className="cd-serial__lines"
        ref={ref}
        onPointerLeave={() => onHoverLine(null)}
      >
        {n === 0 && (
          <span className="cd-serial__empty">Waiting...</span>
        )}
        {runner?.serial.slice(-60).map((s, i) => (
          <div
            key={`${s.at}-${i}`}
            className="cd-serial__line"
            onPointerEnter={() => onHoverLine(s.line)}
          >
            <span className="cd-serial__t">{(s.at / 1000).toFixed(2)}s</span>
            {s.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── The classifier, drawn from its own variables ───────────────────────

/** A number line from 0 to 4095: every example the sketch learned from, the
 *  average of each class, the boundary halfway between them, and where the
 *  knob is now. The examples are gathered by watching the counts go up. */
function ClassifierPanel({ runner }: { runner: Runner }) {
  const seen = useRef<{
    off: number[];
    on: number[];
    offN: number;
    onN: number;
    t: number;
  }>({ off: [], on: [], offN: 0, onN: 0, t: 0 });
  const reading = runner.peek("reading") ?? 0;
  const offN = runner.peek("offCount") ?? 0;
  const onN = runner.peek("onCount") ?? 0;
  const offT = runner.peek("offTotal") ?? 0;
  const onT = runner.peek("onTotal") ?? 0;
  const s = seen.current;
  if (runner.simMs < s.t || offN < s.offN || onN < s.onN)
    Object.assign(s, { off: [], on: [], offN: 0, onN: 0 });
  s.t = runner.simMs;
  if (offN > s.offN) (s.off.push(reading), (s.offN = offN));
  if (onN > s.onN) (s.on.push(reading), (s.onN = onN));

  const W = 520;
  const X0 = 20;
  const X1 = W - 20;
  const x = (v: number) => X0 + (v / 4095) * (X1 - X0);
  const offAvg = offN ? offT / offN : null;
  const onAvg = onN ? onT / onN : null;
  const boundary =
    offAvg !== null && onAvg !== null ? (offAvg + onAvg) / 2 : null;
  const predictsOn =
    offAvg !== null && onAvg !== null
      ? Math.abs(reading - onAvg) < Math.abs(reading - offAvg)
      : null;
  const status =
    offN < 3
      ? `Teaching OFF: ${offN} of 3 examples`
      : onN < 3
        ? `Teaching ON: ${onN} of 3 examples`
        : predictsOn
          ? "Deciding: ON"
          : "Deciding: OFF";
  return (
    <Card padding="md" className="cd-classifier">
      <h2 className="cd-panel-title">What it has learned</h2>
      <p className="cd-panel-sub">
        This is the smallest version of what every classifier does: learn a
        boundary from labelled examples, then sort new inputs by which side they
        fall on. The{" "}
        <Link to="/examples/machine-learning">machine learning examples</Link>{" "}
        do the same with many more numbers.
      </p>
      <svg
        viewBox={`0 0 ${W} 110`}
        width={W}
        height={110}
        className="cd-classifier__fig"
        role="img"
        aria-label="Examples on a number line"
      >
        <line x1={X0} y1={60} x2={X1} y2={60} className="cd-classifier__axis" />
        {[0, 1024, 2048, 3072, 4095].map((v) => (
          <g key={v}>
            <line
              x1={x(v)}
              y1={56}
              x2={x(v)}
              y2={64}
              className="cd-classifier__axis"
            />
            <text x={x(v)} y={80} className="fig-tick" textAnchor="middle">
              {v}
            </text>
          </g>
        ))}
        {boundary !== null && offAvg !== null && onAvg !== null && (
          <>
            {/* Each side of the boundary, washed in the class it predicts. */}
            <rect
              x={X0}
              y={40}
              width={x(boundary) - X0}
              height={40}
              className={`cd-classifier__wash cd-classifier__wash--${offAvg < onAvg ? "off" : "on"}`}
            />
            <rect
              x={x(boundary)}
              y={40}
              width={X1 - x(boundary)}
              height={40}
              className={`cd-classifier__wash cd-classifier__wash--${offAvg < onAvg ? "on" : "off"}`}
            />
            <line
              x1={x(boundary)}
              y1={30}
              x2={x(boundary)}
              y2={88}
              className="cd-classifier__boundary"
            />
            <text
              x={x(boundary)}
              y={100}
              className="fig-note"
              textAnchor="middle"
            >
              boundary
            </text>
          </>
        )}
        {s.off.map((v, i) => (
          <circle
            key={`off${i}`}
            cx={x(v)}
            cy={60 - 8 - i * 7}
            r={4.5}
            className="cd-classifier__dot cd-classifier__dot--off"
          />
        ))}
        {s.on.map((v, i) => (
          <circle
            key={`on${i}`}
            cx={x(v)}
            cy={60 - 8 - i * 7}
            r={4.5}
            className="cd-classifier__dot cd-classifier__dot--on"
          />
        ))}
        {offAvg !== null && (
          <text
            x={x(offAvg)}
            y={22}
            className="cd-classifier__avg cd-classifier__avg--off"
            textAnchor="middle"
          >
            OFF avg
          </text>
        )}
        {onAvg !== null && (
          <text
            x={x(onAvg)}
            y={22}
            className="cd-classifier__avg cd-classifier__avg--on"
            textAnchor="middle"
          >
            ON avg
          </text>
        )}
        <path
          d={`M ${x(reading)} 66 l -6 10 h 12 z`}
          className="cd-classifier__now"
        />
      </svg>
      <div className="cd-classifier__status">
        <span className="wr-kicker">Knob</span>{" "}
        <b className="cd-mono">{reading}</b>
        <span className="cd-classifier__verdict">{status}</span>
      </div>
    </Card>
  );
}
