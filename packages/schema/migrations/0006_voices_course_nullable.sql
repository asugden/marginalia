-- v0.7 follow-up: drop the NOT NULL on voices.course_id.
--
-- 0005 introduced owner_user_id and the per-author authoring model, but
-- left voices.course_id NOT NULL (SQLite can't relax a column's
-- nullability via ALTER). The v0.7 createVoice helper writes course_id
-- as NULL — new voices author at the user level, not the course level.
-- Without this migration, every new-voice INSERT hits a NOT NULL
-- constraint failure.
--
-- Standard SQLite "rebuild the table" recipe, scoped tightly so any
-- in-flight reads keep returning the same rows. We're also keeping the
-- voices.id values stable so the existing voice_shares.voice_id FK
-- references remain valid.

CREATE TABLE voices_new (
  id                     TEXT PRIMARY KEY,
  course_id              TEXT REFERENCES courses(id),  -- now nullable
  name                   TEXT NOT NULL,
  description            TEXT NOT NULL,
  system_prompt_fragment TEXT NOT NULL,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL,
  owner_user_id          TEXT REFERENCES users(id)
);

INSERT INTO voices_new (
  id, course_id, name, description, system_prompt_fragment,
  created_at, updated_at, owner_user_id
)
SELECT id, course_id, name, description, system_prompt_fragment,
       created_at, updated_at, owner_user_id
FROM voices;

DROP TABLE voices;
ALTER TABLE voices_new RENAME TO voices;

CREATE INDEX idx_voices_owner ON voices(owner_user_id);
