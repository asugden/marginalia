// The wiring example (/examples/wiring).
//
// One sandbox and a set of challenges over it. The sandbox is a real
// breadboard with a development board above it: drag wires, resistors and
// LEDs from hole to hole, drop a button or a potentiometer in, set a pin's
// mode the way code would. The challenges are small puzzles on that same
// sandbox, each a starting board and a goal, taken in any order.
//
// It is for beginners whose interest is in what they will build, not in
// electronics. Every explanation comes from what is connected to what
// (analyze.ts, layer 1); voltages are solved only for brightness, burning
// out, and what an input pin reads.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Dropdown, Switch, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "./wiring.css";
import {
  analyze,
  describePath,
  pinState,
  type Analysis,
  type Circuit,
  type LedResult,
  type PathStep,
  type PinReading,
} from "./analyze.js";
import { Breadboard, type Tool } from "./Breadboard.js";
import { CHALLENGES, pinsFor, type GoalContext } from "./challenges.js";
import {
  PIN_BY_ID,
  RESISTOR_CHOICES,
  WIRE_COLORS,
  formatOhms,
  type NodeId,
  type Part,
  type PinState,
  type WireColor,
} from "./model.js";

const TOOLS: Array<{ id: Tool; label: string; hint: string }> = [
  { id: "wire", label: "Wire", hint: "Drag from one hole to another" },
  { id: "resistor", label: "Resistor", hint: "Drag from one hole to another" },
  { id: "led", label: "LED", hint: "Drag from the long leg (+) to the short leg" },
  { id: "button", label: "Button", hint: "Click near the centre channel" },
  { id: "pot", label: "Knob", hint: "Click a hole for its left leg; drag the knob to turn it" },
  { id: "seg7", label: "Display", hint: "Click near the centre channel; X-ray names its legs" },
  { id: "move", label: "Hand", hint: "Select parts, drag legs, press buttons, turn knobs" },
];

export function WiringPage() {
  const [chIdx, setChIdx] = useState(0);
  const challenge = CHALLENGES[chIdx]!;

  const [parts, setParts] = useState<Part[]>(() => CHALLENGES[0]!.setup());
  const [pins, setPins] = useState<Map<NodeId, PinState>>(() => pinsFor(CHALLENGES[0]!));
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [burnt, setBurnt] = useState<Set<string>>(new Set());
  const [popping, setPopping] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ burned: 0, toggles: 0 });
  const [met, setMet] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState<Set<string>>(new Set());

  const [tool, setTool] = useState<Tool>("wire");
  const [wireColor, setWireColor] = useState<WireColor | "auto">("auto");
  const [xray, setXray] = useState(false);
  const [netColors, setNetColors] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealShort, setRevealShort] = useState(false);
  const showShort = !challenge.hideShortPath || revealShort;

  const circuit: Circuit = useMemo(() => ({ parts, pins, pressed, burnt }), [parts, pins, pressed, burnt]);
  const analysis = useMemo(() => analyze(circuit), [circuit]);

  // ── Loading a challenge ──────────────────────────────────────────────

  const load = useCallback((i: number) => {
    const ch = CHALLENGES[i]!;
    setChIdx(i);
    setParts(ch.setup());
    setPins(pinsFor(ch));
    setPressed(new Set());
    setBurnt(new Set());
    setPopping(new Set());
    setStats({ burned: 0, toggles: 0 });
    setMet(new Set());
    setSelected(null);
    setRevealShort(false);
  }, []);

  // ── Too much current burns an LED out ────────────────────────────────

  useEffect(() => {
    const burning = analysis.leds.filter((l) => l.status === "burning").map((l) => l.id);
    if (!burning.length) return;
    setBurnt((prev) => new Set([...prev, ...burning]));
    setStats((s) => ({ ...s, burned: s.burned + burning.length }));
    setPopping((prev) => new Set([...prev, ...burning]));
    const t = window.setTimeout(() => {
      setPopping((prev) => {
        const next = new Set(prev);
        for (const id of burning) next.delete(id);
        return next;
      });
    }, 1400);
    return () => window.clearTimeout(t);
  }, [analysis]);

  // ── Goals ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!challenge.goals.length) return;
    const ctx: GoalContext = { analysis, circuit, stats };
    let changed = false;
    const next = new Set(met);
    challenge.goals.forEach((g, i) => {
      if (!next.has(i) && g.check(ctx)) next.add(i), (changed = true);
    });
    if (!changed) return;
    setMet(next);
    if (next.size === challenge.goals.length) setFinished((f) => new Set(f).add(challenge.id));
  }, [analysis, circuit, stats, challenge, met]);

  const complete = challenge.goals.length > 0 && met.size === challenge.goals.length;

  // ── Editing ──────────────────────────────────────────────────────────

  const selectedPart = parts.find((p) => p.id === selected) ?? null;
  const selectedPin = selected && PIN_BY_ID.get(selected)?.kind === "gpio" ? selected : null;

  const remove = useCallback((id: string) => {
    setParts((ps) => ps.filter((p) => p.id !== id));
    setBurnt((b) => new Set([...b].filter((x) => x !== id && !x.startsWith(`${id}:`))));
    setSelected(null);
  }, []);

  const change = (id: string, patch: Partial<Part>) =>
    setParts((ps) => ps.map((p) => (p.id === id ? ({ ...p, ...patch } as Part) : p)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !PIN_BY_ID.has(selected)) {
        e.preventDefault();
        remove(selected);
      } else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, remove]);

  const setPin = (id: NodeId, s: PinState) => setPins((m) => new Map(m).set(id, s));

  /** Clicking a pin selects it; clicking an OUTPUT pin also flips it, which
   *  is the quickest way to play at being digitalWrite. */
  const pinClick = (id: NodeId) => {
    setSelected(id);
    const s = pinState(circuit, id);
    if (s.mode === "OUTPUT") {
      setPin(id, { mode: "OUTPUT", level: s.level ? 0 : 1 });
      setStats((st) => ({ ...st, toggles: st.toggles + 1 }));
    }
  };

  const press = (id: string, down: boolean) =>
    setPressed((p) => {
      if (p.has(id) === down) return p;
      const n = new Set(p);
      if (down) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link to="/examples" className="app-lockup-link" aria-label="Examples">
            <Wordmark size="sm" />
          </Link>
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="mnist-page wr-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Breadboards and Loops</h1>
            <p className="mnist-lede">
              Every circuit is a loop: out of the power pin, through the thing you want to power, and back to
              ground. Pick a challenge, or go straight to free play and build whatever you like.
            </p>
          </div>

          <div className="wr-layout">
            <div className="wr-side">
              <TourCard index={chIdx} met={met} finished={finished} complete={complete} onGo={load} />
              <Readout
                analysis={analysis}
                parts={parts}
                burned={stats.burned}
                showShort={showShort}
                onRevealShort={() => setRevealShort(true)}
              />
            </div>

            <Card padding="md" className="wr-stage">
              <div className="wr-controls">
                <div className="wr-controls__row">
                  <span className="wr-controls__label">Place</span>
                  <div className="wr-controls__buttons">
                    {TOOLS.map((t) => (
                      <Button
                        key={t.id}
                        size="sm"
                        variant={tool === t.id ? "primary" : "subtle"}
                        onClick={() => setTool(t.id)}
                        title={t.hint}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="wr-controls__row">
                  <span className="wr-controls__label">See</span>
                  <div className="wr-controls__buttons wr-controls__switches">
                    <Switch label="X-ray" checked={xray} onChange={(e) => setXray(e.currentTarget.checked)} />
                    <Switch
                      label="Colour by connection"
                      checked={netColors}
                      onChange={(e) => setNetColors(e.currentTarget.checked)}
                    />
                  </div>
                </div>
                <div className="wr-controls__row wr-controls__row--context">
                  <span className="wr-controls__label">{selectedPart || selectedPin ? "Selected" : "Tip"}</span>
                  {selectedPin ? (
                    <PinPanel
                      id={selectedPin}
                      state={pinState(circuit, selectedPin)}
                      reading={analysis.readings.find((r) => r.id === selectedPin)}
                      onChange={(s) => {
                        const prev = pinState(circuit, selectedPin);
                        if (prev.mode === "OUTPUT" && s.mode === "OUTPUT" && prev.level !== s.level) {
                          setStats((st) => ({ ...st, toggles: st.toggles + 1 }));
                        }
                        setPin(selectedPin, s);
                      }}
                    />
                  ) : selectedPart ? (
                    <SelectionActions
                      part={selectedPart}
                      burnt={[...burnt].some((b) => b === selectedPart.id || b.startsWith(`${selectedPart.id}:`))}
                      onRemove={() => remove(selectedPart.id)}
                      onChange={(patch) => change(selectedPart.id, patch)}
                      onReplace={() =>
                        setBurnt(
                          (b) => new Set([...b].filter((x) => x !== selectedPart.id && !x.startsWith(`${selectedPart.id}:`))),
                        )
                      }
                    />
                  ) : tool === "wire" ? (
                    <div className="wr-controls__buttons">
                      <span className="wr-tip">{TOOLS.find((t) => t.id === tool)!.hint}.</span>
                      <ColorPicker value={wireColor} onChange={setWireColor} />
                    </div>
                  ) : (
                    <span className="wr-tip">{TOOLS.find((t) => t.id === tool)!.hint}.</span>
                  )}
                </div>
              </div>

              <div className="wr-figure">
                <Breadboard
                  circuit={circuit}
                  analysis={analysis}
                  showShort={showShort}
                  tool={tool}
                  wireColor={wireColor}
                  xray={xray}
                  netColors={netColors}
                  selected={selected}
                  popping={popping}
                  onSelect={setSelected}
                  onAdd={(p) => setParts((ps) => [...ps, p])}
                  onChange={change}
                  onPress={press}
                  onPinClick={pinClick}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── The challenges ─────────────────────────────────────────────────────

function TourCard({
  index,
  met,
  finished,
  complete,
  onGo,
}: {
  index: number;
  met: ReadonlySet<number>;
  finished: ReadonlySet<string>;
  complete: boolean;
  onGo: (i: number) => void;
}) {
  const ch = CHALLENGES[index]!;
  const next = index < CHALLENGES.length - 1 ? index + 1 : null;
  const options = CHALLENGES.map((c, i) => ({
    value: String(i),
    triggerLabel: c.title,
    label: (
      <span className="wr-menu-item">
        <span className="wr-menu-item__group">{c.group}</span>
        <span>
          {finished.has(c.id) ? "✓ " : ""}
          {c.title}
        </span>
      </span>
    ),
  }));
  return (
    <Card padding="md" className={`wr-tour${complete ? " wr-tour--done" : ""}`}>
      <p className="wr-kicker">
        {ch.group}
        {finished.size > 0 && ` · ${finished.size} of ${CHALLENGES.length - 1} done`}
      </p>
      <Dropdown
        value={String(index)}
        options={options}
        onChange={(v) => onGo(Number(v))}
        ariaLabel="Challenge"
        className="wr-tour__menu"
      />
      <p className="wr-tour__prompt">{ch.prompt}</p>
      {ch.goals.length > 0 && (
        <ul className="wr-goals">
          {ch.goals.map((g, i) => (
            <li key={i} className={met.has(i) ? "wr-goal wr-goal--met" : "wr-goal"}>
              <span className="wr-goal__box" aria-hidden="true">
                {met.has(i) ? "✓" : ""}
              </span>
              {g.label}
            </li>
          ))}
        </ul>
      )}
      {complete && ch.payoff && <p className="wr-tour__payoff">{ch.payoff}</p>}
      <div className="wr-tour__actions">
        <Button size="sm" variant="subtle" onClick={() => onGo(index)}>
          Start over
        </Button>
        {next !== null && (
          <Button size="sm" variant={complete ? "primary" : "ghost"} onClick={() => onGo(next)}>
            {complete ? "Next" : "Skip"}: {CHALLENGES[next]!.title}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── What the board is doing ────────────────────────────────────────────

function Readout({
  analysis,
  parts,
  burned,
  showShort,
  onRevealShort,
}: {
  analysis: Analysis;
  parts: Part[];
  burned: number;
  showShort: boolean;
  onRevealShort: () => void;
}) {
  const leds = analysis.leds;
  const single = leds.filter((l) => !l.id.includes(":"));
  return (
    <div className="wr-readout" aria-live="polite">
      <div className="wr-readout__row">
        <span className="wr-kicker">Board</span>
        {analysis.short ? (
          <span className="wr-status wr-status--bad">Short circuit: it shut itself off</span>
        ) : (
          <span className="wr-status wr-status--ok">Powered</span>
        )}
      </div>
      {analysis.short && (
        <div className="wr-readout__block">
          <p className="wr-readout__why">{shortWhy(analysis.short.kind)}</p>
          {showShort ? (
            <Chain steps={describePath(analysis.short.path)} bad />
          ) : (
            <div>
              <Button size="sm" variant="subtle" onClick={onRevealShort}>
                Show the path
              </Button>
            </div>
          )}
        </div>
      )}
      {displays(leds, parts).map((d) => (
        <div key={d.id} className="wr-readout__block">
          <div className="wr-readout__row">
            <span className="wr-kicker">{d.name}</span>
            <span className={`wr-status wr-status--${d.lit.length ? "ok" : d.burnt.length ? "bad" : "muted"}`}>
              {d.lit.length ? `Lit: ${d.lit.join(" ")}` : "Dark"}
            </span>
          </div>
          {d.burnt.length > 0 && (
            <p className="wr-readout__why">
              Burnt out: {d.burnt.join(" ")}. A segment is an LED, and needs a resistor like any other.
            </p>
          )}
        </div>
      ))}
      {single.map((l, i) => (
        <div key={l.id} className="wr-readout__block">
          <div className="wr-readout__row">
            <span className="wr-kicker">{single.length > 1 ? `LED ${i + 1}` : "LED"}</span>
            <span className={`wr-status wr-status--${statusTone(l)}`}>{statusWord(l)}</span>
          </div>
          <p className="wr-readout__why">{statusWhy(l)}</p>
          {l.status === "lit" && l.loop && <Chain steps={describePath(l.loop)} />}
        </div>
      ))}
      {analysis.readings.map((r) => (
        <PinReadout key={r.id} reading={r} />
      ))}
      {!leds.length && !analysis.short && !analysis.readings.length && (
        <p className="wr-readout__why">Nothing on the board yet.</p>
      )}
      {burned > 0 && (
        <p className="wr-readout__count">
          LEDs burned out: <b>{burned}</b>
        </p>
      )}
    </div>
  );
}

/** Display segments, grouped back into their displays. */
function displays(leds: LedResult[], parts: Part[]) {
  const shown = parts.filter((p) => p.kind === "seg7");
  return shown.map((p, i) => {
    const mine = leds.filter((l) => l.id.startsWith(`${p.id}:`));
    const seg = (l: LedResult) => l.id.split(":")[1]!;
    return {
      id: p.id,
      name: shown.length > 1 ? `Display ${i + 1}` : "Display",
      lit: mine.filter((l) => l.status === "lit").map(seg),
      burnt: mine.filter((l) => l.status === "burnt" || l.status === "burning").map(seg),
    };
  });
}

function PinReadout({ reading }: { reading: PinReading }) {
  const pin = PIN_BY_ID.get(reading.id)!;
  return (
    <div className="wr-readout__block">
      <div className="wr-readout__row">
        <span className="wr-kicker">{pin.label} reads</span>
        {reading.digital === "floating" ? (
          <span className="wr-status wr-status--muted wr-floating">
            <span>HIGH</span>
            <span>LOW</span>
          </span>
        ) : (
          <span className="wr-status wr-status--ok">{reading.digital}</span>
        )}
      </div>
      {reading.digital === "floating" ? (
        <p className="wr-readout__why">Connected to nothing, so it picks up noise and reads at random.</p>
      ) : reading.analog !== undefined ? (
        <div className="wr-meter">
          <div className="wr-meter__track">
            <div className="wr-meter__fill" style={{ width: `${(reading.analog / 4095) * 100}%` }} />
          </div>
          <span className="wr-meter__value">
            analogRead <b>{reading.analog}</b> · {reading.volts!.toFixed(2)} V
          </span>
        </div>
      ) : (
        <p className="wr-readout__why">{reading.volts!.toFixed(2)} V. This pin has no analog reader.</p>
      )}
    </div>
  );
}

function Chain({ steps, bad = false }: { steps: PathStep[]; bad?: boolean }) {
  return (
    <ol className={bad ? "wr-chain wr-chain--bad" : "wr-chain"}>
      {steps.map((s, i) => (
        <li key={i} className={`wr-chain__step wr-chain__step--${s.kind}`}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function shortWhy(kind: "supply" | "pin" | "supplies") {
  if (kind === "pin") return "A pin that's switched on reaches GND, or a pin set LOW, through nothing but wire.";
  if (kind === "supplies") return "VIN's 5 volts reaches the 3.3 volt pin directly.";
  return "3V3 reaches GND through nothing but wire. There's no load in the loop.";
}

function statusWord(l: LedResult) {
  switch (l.status) {
    case "lit":
      return l.brightness > 0.85 ? "Lit" : l.brightness > 0.35 ? "Lit, dim" : "Barely lit";
    case "burning":
    case "burnt":
      return "Burnt out";
    case "off":
      return "Off";
    default:
      return "Dark";
  }
}

function statusTone(l: LedResult) {
  if (l.status === "lit") return "ok";
  if (l.status === "burnt" || l.status === "burning") return "bad";
  return "muted";
}

function statusWhy(l: LedResult): string {
  switch (l.status) {
    case "lit":
      return `${l.mA!.toFixed(1)} mA through it. The loop:`;
    case "burning":
    case "burnt":
      return "Too much current: nothing in its loop held it back. Select it and press Replace.";
    case "too-low":
      return "The loop is closed, but there isn't enough voltage across it to light.";
    case "off":
      return "The board shut off, so nothing gets power.";
    case "backwards":
      return "It's in backwards. The long leg (+) goes toward power.";
    case "bypassed":
      return "Both legs are joined, so power goes around it instead of through it.";
    case "no-power":
      return "It has a way back to GND, but nothing brings power to its long leg (+).";
    case "no-return":
      return "Power reaches it, but its short leg has no way back to GND.";
    case "pin-off": {
      const label = l.pin ? PIN_BY_ID.get(l.pin)?.label : "the pin";
      return `The loop runs through ${label}, which isn't switched on. Select ${label} on the board.`;
    }
    default:
      return "Not connected to power or GND yet.";
  }
}

// ── Selection ──────────────────────────────────────────────────────────

function SelectionActions({
  part,
  burnt,
  onRemove,
  onChange,
  onReplace,
}: {
  part: Part;
  burnt: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<Part>) => void;
  onReplace: () => void;
}) {
  const name =
    part.kind === "led"
      ? "LED"
      : part.kind === "pot"
        ? "Knob"
        : part.kind === "seg7"
          ? "Display"
          : part.kind[0]!.toUpperCase() + part.kind.slice(1);
  return (
    <div className="wr-controls__buttons">
      <span className="wr-sel-name">{name}</span>
      {(part.kind === "led" || part.kind === "seg7") && burnt && (
        <Button size="sm" variant="subtle" onClick={onReplace}>
          Replace
        </Button>
      )}
      {part.kind === "led" && (
        <Button size="sm" variant="subtle" onClick={() => onChange({ a: part.b, b: part.a })}>
          Flip
        </Button>
      )}
      {part.kind === "button" && (
        <Button size="sm" variant="subtle" onClick={() => onChange({ turned: !part.turned })}>
          Turn 90°
        </Button>
      )}
      {part.kind === "resistor" &&
        RESISTOR_CHOICES.map((r) => (
          <Button
            key={r}
            size="sm"
            variant={(part.ohms ?? 220) === r ? "primary" : "subtle"}
            onClick={() => onChange({ ohms: r })}
          >
            {formatOhms(r)}
          </Button>
        ))}
      {part.kind === "pot" && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={part.turn}
          onChange={(e) => onChange({ turn: parseFloat(e.target.value) })}
          aria-label="Knob position"
          className="wr-range"
        />
      )}
      {part.kind === "wire" && (
        <ColorPicker
          value={(part.color as WireColor) ?? "yellow"}
          onChange={(c) => c !== "auto" && onChange({ color: c })}
        />
      )}
      <Button size="sm" variant="danger" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}

/** A pin's mode, as a sketch would set it. */
function PinPanel({
  id,
  state,
  reading,
  onChange,
}: {
  id: NodeId;
  state: PinState;
  reading?: PinReading;
  onChange: (s: PinState) => void;
}) {
  const pin = PIN_BY_ID.get(id)!;
  const modes: Array<{ label: string; to: PinState; on: boolean; disabled?: boolean }> = [
    { label: "INPUT", to: { mode: "INPUT" }, on: state.mode === "INPUT" },
    { label: "INPUT_PULLDOWN", to: { mode: "INPUT_PULLDOWN" }, on: state.mode === "INPUT_PULLDOWN" },
    { label: "INPUT_PULLUP", to: { mode: "INPUT_PULLUP" }, on: state.mode === "INPUT_PULLUP" },
    { label: "OUTPUT", to: { mode: "OUTPUT", level: 0 }, on: state.mode === "OUTPUT", disabled: pin.inputOnly },
    { label: "PWM", to: { mode: "PWM", duty: 128 }, on: state.mode === "PWM", disabled: pin.inputOnly },
  ];
  return (
    <div className="wr-pinpanel">
      <div className="wr-controls__buttons">
        <span className="wr-sel-name">
          {pin.label} <span className="wr-sel-sub">GPIO {pin.gpio}</span>
        </span>
        {modes.map((m) => (
          <Button
            key={m.label}
            size="sm"
            variant={m.on ? "primary" : "subtle"}
            disabled={m.disabled}
            title={m.disabled ? "This pin can only read" : undefined}
            onClick={() => !m.on && onChange(m.to)}
          >
            {m.label}
          </Button>
        ))}
      </div>
      <div className="wr-controls__buttons wr-pinpanel__detail">
        {state.mode === "OUTPUT" && (
          <>
            <Button size="sm" variant={state.level ? "primary" : "subtle"} onClick={() => onChange({ mode: "OUTPUT", level: 1 })}>
              HIGH
            </Button>
            <Button size="sm" variant={!state.level ? "primary" : "subtle"} onClick={() => onChange({ mode: "OUTPUT", level: 0 })}>
              LOW
            </Button>
            <code className="wr-code">
              digitalWrite({pin.gpio}, {state.level ? "HIGH" : "LOW"});
            </code>
          </>
        )}
        {state.mode === "PWM" && (
          <>
            <input
              type="range"
              min={0}
              max={255}
              step={1}
              value={state.duty}
              onChange={(e) => onChange({ mode: "PWM", duty: parseInt(e.target.value, 10) })}
              aria-label="PWM duty"
              className="wr-range"
            />
            <PwmWave duty={state.duty} />
            <code className="wr-code">
              analogWrite({pin.gpio}, {state.duty});
            </code>
          </>
        )}
        {(state.mode === "INPUT" || state.mode === "INPUT_PULLDOWN" || state.mode === "INPUT_PULLUP") && (
          <code className="wr-code">
            {reading
              ? reading.analog !== undefined && reading.digital !== "floating"
                ? `analogRead(${pin.gpio}) → ${reading.analog}`
                : `digitalRead(${pin.gpio}) → ${reading.digital === "floating" ? "?" : reading.digital}`
              : `pinMode(${pin.gpio}, ${state.mode}); // nothing plugged in`}
          </code>
        )}
        {pin.inputOnly && <span className="wr-tip">This pin can only read.</span>}
      </div>
    </div>
  );
}

/** Four periods of the PWM square wave, so "half brightness" reads as
 *  "on half the time". */
function PwmWave({ duty }: { duty: number }) {
  const w = 96;
  const h = 18;
  const period = w / 4;
  const on = (duty / 255) * period;
  let d = `M 0 ${h}`;
  for (let i = 0; i < 4; i++) {
    const x = i * period;
    if (on > 0) d += ` L ${x} ${h} L ${x} 2 L ${x + on} 2 L ${x + on} ${h}`;
    d += ` L ${x + period} ${h}`;
  }
  return (
    <svg width={w} height={h + 2} viewBox={`0 0 ${w} ${h + 2}`} className="wr-wave" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function ColorPicker({ value, onChange }: { value: WireColor | "auto"; onChange: (c: WireColor | "auto") => void }) {
  return (
    <span className="wr-swatches" role="radiogroup" aria-label="Wire colour">
      {(Object.keys(WIRE_COLORS) as WireColor[]).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          title={c}
          className={value === c ? "wr-swatch wr-swatch--on" : "wr-swatch"}
          style={{ background: WIRE_COLORS[c] }}
          onClick={() => onChange(value === c ? "auto" : c)}
        />
      ))}
    </span>
  );
}
