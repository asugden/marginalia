// AgentDefinition — what an instructor authors. Stored as JSON on the
// `agents` row. Renamed from AssignmentDefinition in v0.4.
//
// Three composable components, all optional except the voice:
//   - backbone     → topic sequence + enforcement (the v0.1 mode)
//   - collectionId → ground replies in a Vectorize collection (RAG)
//   - model        → per-agent model override
//
// Free-form Q&A is just an AgentDefinition with no backbone and no collection.

import type { VoiceRef } from "@marginalia/voices";
import type { BackboneComponent } from "./types.js";

export interface AgentDefinition {
  /** Bump on breaking changes; readers can migrate or refuse. */
  version: 2;

  /** How the agent talks. Library reference or inline-authored. */
  voice: VoiceRef;

  /** Optional topic sequence; omit for free-form chat. */
  backbone?: BackboneComponent;

  /**
   * Optional Vectorize collection to retrieve from. The picker in the author
   * UI surfaces every collection in the course.
   */
  collectionId?: string;

  /**
   * Optional per-agent model override, e.g. "claude-haiku-4-5-20251001".
   * The string is opaque here; only the provider adapter interprets it.
   * Falls back to the Worker's DEFAULT_MODEL when omitted.
   */
  model?: string;
}
