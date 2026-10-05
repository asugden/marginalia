// The title an item is listed under. Examples are stored by slug, and their
// display title lives in the examples registry, so every list resolves it
// here rather than showing the slug.

import { findExample } from "../../examples/registry.js";
import type { CourseItemDTO } from "./api.js";

export function itemTitle(item: CourseItemDTO): string {
  return item.kind === "example" ? (findExample(item.payloadRef)?.title ?? item.title) : item.title;
}
