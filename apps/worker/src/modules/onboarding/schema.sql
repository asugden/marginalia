-- Reference snapshot of the onboarding module's table. The source of truth is
-- packages/schema/migrations/0031_onboarding.sql.

CREATE TABLE onboarding_progress (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  preset_json  TEXT NOT NULL DEFAULT '{}',
  context_json TEXT NOT NULL DEFAULT '{}',
  step         INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  dismissed_at INTEGER,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, course_id)
);
