// The code switch, placed at the upper right of an example's own heading
// (never in the site topbar, which is the same on every page). It is the
// design system's Switch, as for any page-wide on/off (docs/style.md §14).
// When code is on and the example has more than one way of writing it, the
// design system's Dropdown (a designed menu, not the browser's native one)
// beside the switch picks the version.

import { Dropdown, Switch } from "../../../components/index.js";
import type { CodeVersion } from "./types.js";

export interface CodeToggleProps {
  on: boolean;
  onChange: (on: boolean) => void;
  versions: CodeVersion[];
  versionId: string;
  onVersion: (id: string) => void;
}

export function CodeToggle({
  on,
  onChange,
  versions,
  versionId,
  onVersion,
}: CodeToggleProps) {
  return (
    <div className="ex-code-toggle">
      {on && versions.length > 1 && (
        <Dropdown
          className="ex-code-toggle__version"
          ariaLabel="Code version"
          align="end"
          value={versionId}
          options={versions.map((v) => ({ value: v.id, label: v.label }))}
          onChange={onVersion}
        />
      )}
      <Switch label="Code" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}
