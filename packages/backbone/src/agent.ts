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

/**
 * v1.0 — the student-facing "clarity" line for an agent. Returns the
 * instructor's custom note when set, otherwise a default derived from
 * the agent's shape so the student always gets *some* framing about
 * what this conversation is and how it behaves.
 *
 * Shared by the worker (which could inline it) and the web chat banner
 * so the wording stays identical everywhere.
 */
export function clarityNoteFor(def: {
  clarityNote?: string;
  backbone?: unknown;
  collectionId?: string;
}): string {
  if (def.clarityNote && def.clarityNote.trim()) {
    return def.clarityNote.trim();
  }
  const grounded = !!def.collectionId;
  const guided = !!def.backbone;
  if (guided && grounded) {
    return (
      "Your instructor set this up to walk you through a sequence of topics, " +
      "drawing on a specific set of sources. It cites what it leans on so you " +
      "can check it."
    );
  }
  if (guided) {
    return (
      "Your instructor set this up to walk you through a sequence of topics, " +
      "one at a time. It decides when you're ready to move on."
    );
  }
  if (grounded) {
    return (
      "Your instructor grounded this in a specific set of sources. It answers " +
      "from those and cites them, so you can check where an answer came from."
    );
  }
  return (
    "This is an open conversation set up by your instructor. Ask it whatever " +
    "you need for this course."
  );
}

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

  /**
   * v1.0 — a short, student-facing note shown at the top of the
   * conversation. The instructor's chance to set expectations in their
   * own words ("This tutor won't give you the answer — it'll ask you
   * questions until you can"). When omitted, the UI shows a default
   * derived from the agent's shape (grounded / outline / open), so a
   * student always gets *some* framing. Plain text, kept short by the
   * editor. This is about clarity, not control — it's guidance the
   * student reads, not a rule the system enforces.
   */
  clarityNote?: string;
}
