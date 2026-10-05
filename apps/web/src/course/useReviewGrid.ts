// Loads the staff review grid (see reviewGrid.ts) for a course. Every
// submission page asks for it, and stepping from one student to the next
// remounts the page, so the load is shared and briefly cached: a run of
// next / next / next costs one set of requests, not one per student.
//
// Each source fails soft: a module that's off (or a request that fails) just
// contributes nothing, and the moves it would have offered aren't shown.

import { useEffect, useState } from "react";
import {
  listAssignmentsWithStats as listWriting,
  listCourseSubmissions,
} from "../modules/provenance/api.js";
import {
  listAssignmentsWithStats as listCode,
  listLatestSubmissions,
} from "../modules/code/api.js";
import { buildReviewGrid, type ReviewGrid } from "./reviewGrid.js";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; grid: Promise<ReviewGrid> }>();

function loadGrid(courseId: string): Promise<ReviewGrid> {
  const hit = cache.get(courseId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.grid;
  const grid = Promise.all([
    listWriting(courseId).then((r) => r.assignments).catch(() => []),
    listCourseSubmissions(courseId).catch(() => []),
    listCode(courseId).then((r) => r.assignments).catch(() => []),
    listLatestSubmissions(courseId).catch(() => []),
  ]).then(([writing, writingSubs, code, codeSubs]) =>
    buildReviewGrid({ courseId, writing, writingSubs, code, codeSubs }),
  );
  cache.set(courseId, { at: Date.now(), grid });
  // A failed load mustn't be served from the cache.
  grid.catch(() => cache.delete(courseId));
  return grid;
}

/** The grid, or null while loading (and when there's no course yet). */
export function useReviewGrid(courseId: string | null | undefined): ReviewGrid | null {
  const [grid, setGrid] = useState<ReviewGrid | null>(null);
  useEffect(() => {
    if (!courseId) return;
    let live = true;
    loadGrid(courseId).then((g) => live && setGrid(g), () => {});
    return () => {
      live = false;
    };
  }, [courseId]);
  return grid;
}
