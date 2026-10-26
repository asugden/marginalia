// Whether the code view is on, and which version is picked.
//
// Code is off whenever a page opens; the on/off choice is not remembered.
// The version pick is remembered per example, in this browser only, and
// every read and write tolerates storage being unavailable (private
// windows, blocked site data): the page then starts on the first version.

import { useCallback, useState } from "react";
import type { CodeVersion } from "./types.js";

const versionKey = (slug: string) => `examples:code:version:${slug}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

export function useCodeView(slug: string, versions: CodeVersion[]) {
  const [on, setOn] = useState(false);
  const [versionId, setVersionState] = useState(() => {
    const saved = read(versionKey(slug));
    return versions.some((v) => v.id === saved) ? saved! : versions[0]!.id;
  });

  const setVersion = useCallback(
    (id: string) => {
      setVersionState(id);
      write(versionKey(slug), id);
    },
    [slug],
  );

  const version = versions.find((v) => v.id === versionId) ?? versions[0]!;
  return { on, setOn, version, setVersion };
}
