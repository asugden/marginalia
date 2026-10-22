// Whether the code view is on, and which version is picked.
//
// Code is off by default. The on/off choice is one setting shared by every
// example, so a reader who wants code sees it everywhere; the version pick
// is remembered per example. Both live in this browser only, and every
// read and write tolerates storage being unavailable (private windows,
// blocked site data): the page then just starts with code off.

import { useCallback, useState } from "react";
import type { CodeVersion } from "./types.js";

const ON_KEY = "examples:code:on";
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
  const [on, setOnState] = useState(() => read(ON_KEY) === "1");
  const [versionId, setVersionState] = useState(() => {
    const saved = read(versionKey(slug));
    return versions.some((v) => v.id === saved) ? saved! : versions[0]!.id;
  });

  const setOn = useCallback((next: boolean) => {
    setOnState(next);
    write(ON_KEY, next ? "1" : "0");
  }, []);
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
