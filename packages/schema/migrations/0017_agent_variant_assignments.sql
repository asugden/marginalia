-- 0017 — hidden A/B variant assignments.
-- An agent whose AgentDefinition carries two or more `variants` runs as a
-- split: each student is randomly (balanced) assigned exactly one arm the
-- first time they start that agent, and the assignment sticks for all of
-- their conversations on it. Students are never told which arm they got.
--
-- This table is the assignment ledger. The chosen arm's voice is
-- materialised into each conversation's definition_snapshot at start (like
-- a custom-ref voice), so turn execution never reads this table — it exists
-- for sticky assignment and the instructor results view.
--
-- variant_id is the AgentVariant.id string from the definition (e.g.
-- "arm-a"). It is intentionally NOT a foreign key: variants live inside a
-- JSON blob, and an instructor may later remove an arm. Assignments stay
-- sticky by id regardless — running conversations already snapshotted their
-- voice, and new conversations for an orphaned assignment fall back to a
-- surviving arm in application code.

CREATE TABLE agent_variant_assignments (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id),   -- denormalized for tenant-filtered results
  agent_id    TEXT NOT NULL REFERENCES agents(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  variant_id  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (agent_id, user_id)                           -- one sticky arm per student+agent
);

-- Results view + balanced-assignment counts both group by (agent_id, variant_id).
CREATE INDEX idx_variant_assignments_agent
  ON agent_variant_assignments(agent_id, variant_id);
