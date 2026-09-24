// Renders a cell's outputs. Every kind is structured data rendered through
// React — text in <pre>, figures through an <img> data URI, tables as
// cells — so nothing a student's code prints can inject markup. That matters
// because an instructor opens submitted notebooks on their own screen.

import type { CellOutput } from "../api.js";

/** Merge adjacent stream chunks of the same name, as a terminal would. */
export function appendOutput(outputs: CellOutput[], next: CellOutput): CellOutput[] {
  const last = outputs[outputs.length - 1];
  if (next.type === "stream" && last?.type === "stream" && last.name === next.name) {
    return [...outputs.slice(0, -1), { ...last, text: last.text + next.text }];
  }
  return [...outputs, next];
}

export function Outputs({ outputs }: { outputs: CellOutput[] }) {
  if (outputs.length === 0) return null;
  return (
    <div className="code-outputs">
      {outputs.map((o, i) => (
        <OutputItem key={i} output={o} />
      ))}
    </div>
  );
}

function OutputItem({ output: o }: { output: CellOutput }) {
  switch (o.type) {
    case "stream":
      return (
        <pre className={`code-out code-out--stream${o.name === "stderr" ? " is-stderr" : ""}`}>
          {o.text}
        </pre>
      );
    case "result":
      return <pre className="code-out code-out--result">{o.text}</pre>;
    case "image":
      return (
        <div className="code-out code-out--image">
          <img src={`data:image/png;base64,${o.data}`} alt="Figure output" />
        </div>
      );
    case "table":
      return <TableOutput output={o} />;
    case "error":
      return (
        <div className="code-out code-out--error" role="alert">
          <div className="code-out__ename">
            {o.ename}
            {o.evalue ? `: ${o.evalue}` : ""}
          </div>
          {o.traceback && <pre>{o.traceback}</pre>}
        </div>
      );
  }
}

function TableOutput({ output: o }: { output: Extract<CellOutput, { type: "table" }> }) {
  const [rows, cols] = o.shape;
  const truncated = rows > o.rows.length || cols > o.columns.length;
  return (
    <div className="code-out code-out--table">
      <div className="code-table__scroll">
        <table className="code-table">
          <thead>
            <tr>
              <th aria-label="Index" />
              {o.columns.map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {o.rows.map((r, i) => (
              <tr key={i}>
                <th scope="row">{o.index[i]}</th>
                {r.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="code-table__shape">
        {rows.toLocaleString()} rows × {cols.toLocaleString()} columns
        {truncated ? ` · showing ${o.rows.length} × ${o.columns.length}` : ""}
      </div>
    </div>
  );
}
