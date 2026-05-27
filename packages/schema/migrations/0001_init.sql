-- 0001_init — multi-tenant core schema. Rewritten for v0.4.
-- Every student-data query MUST filter by course_id. No cross-course leakage.
--
-- v0.1 used `backbones` / `conversations.backbone_id`. v0.2 promoted the
-- thing instructors author to `assignments`. v0.4 renames that top-level
-- concept again — to `agents` — and renames the v0.2 `agents` (curated
-- personas) to `voices`. v0.4 also renames `source_corpora`/`corpus_sources`
-- to `collections`/`collection_sources`. Because v0.4 has no production
-- deployment, the migration is a single rewrite rather than chained renames.

CREATE TABLE organizations (
  id          TEXT PRIMARY KEY,          -- e.g. "default" or your tenant slug
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL           -- unix epoch ms
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  email         TEXT NOT NULL,
  display_name  TEXT,
  -- Bumped on each authenticated request, rate-limited to once every few
  -- minutes so write amplification stays bounded. Used by the roster UI
  -- (§10) — "last seen 12 min ago" vs "never seen".
  last_seen_at  INTEGER,
  created_at    INTEGER NOT NULL,
  UNIQUE (org_id, email)
);

CREATE TABLE courses (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE enrollments (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('student', 'instructor', 'ta')),
  created_at  INTEGER NOT NULL,
  UNIQUE (course_id, user_id)
);

-- The top-level thing a student picks from a list. What v0.2 called an
-- "assignment". `definition` is the AgentDefinition JSON blob (which may
-- compose a backbone, a collection reference, neither, or both).
CREATE TABLE agents (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id),
  title       TEXT NOT NULL,
  definition  TEXT NOT NULL,             -- JSON: AgentDefinition
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Instructor-authored voices (the curated library lives in code).
-- These extend the library with course-specific personas / house styles.
-- A "voice" is a bundled prompt fragment describing how the agent talks.
CREATE TABLE voices (
  id                     TEXT PRIMARY KEY,
  course_id              TEXT NOT NULL REFERENCES courses(id),
  name                   TEXT NOT NULL,
  description            TEXT NOT NULL,
  system_prompt_fragment TEXT NOT NULL,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

-- Source collections. Vectorize namespace = `collection:{id}`. Files in R2
-- under the collection's course namespace, registered in collection_sources.
CREATE TABLE collections (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- A source can be: an uploaded PDF, an uploaded markdown/text file, pasted
-- text (also stored as a text blob), or a URL the worker fetched. In every
-- case r2_key holds the raw bytes captured at index time so the source is
-- reproducible without ever re-fetching the remote. URL sources additionally
-- record the original URL and a fetched_at timestamp.
CREATE TABLE collection_sources (
  id            TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  course_id     TEXT NOT NULL,                       -- denormalized for tenant filter
  filename      TEXT NOT NULL,
  r2_key        TEXT NOT NULL,
  byte_size     INTEGER NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'pdf'
                CHECK (kind IN ('pdf', 'markdown', 'text', 'url')),
  source_url    TEXT,                                 -- set when kind='url'
  fetched_at    INTEGER,                              -- when kind='url' was fetched
  content_type  TEXT,                                 -- resolved mime type
  chunks        INTEGER NOT NULL DEFAULT 0,          -- 0 until indexing completes
  status        TEXT NOT NULL CHECK (status IN ('pending', 'indexed', 'failed')),
  error         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- One conversation = one student working through one agent.
-- `backbone_state` is the BackboneState JSON blob (null when the agent
-- has no backbone component — free-form chat).
-- `definition_snapshot` is the JSON-encoded AgentDefinition captured at
-- conversation start. We use the snapshot for turn execution so that mid-flight
-- instructor edits don't desync backbone state, change collection references,
-- or silently bump the model on a running conversation.
-- `turn_count` is the running count of completed assistant replies; used to
-- enforce per-conversation turn caps without re-counting messages on every turn.
-- `title` is null for backbone conversations (derived server-side from the
-- agent + state at read time) and lazily generated for free-chat conversations
-- after the first user/assistant exchange. `completed_at` is set when a
-- backbone hits its exit condition (or exhausts its topic budget); a
-- completed conversation is read-only and POST .../messages rejects with 422.
CREATE TABLE conversations (
  id                   TEXT PRIMARY KEY,
  course_id            TEXT NOT NULL REFERENCES courses(id),
  user_id              TEXT NOT NULL REFERENCES users(id),
  agent_id             TEXT REFERENCES agents(id),
  definition_snapshot  TEXT NOT NULL,              -- JSON: AgentDefinition snapshot
  backbone_state       TEXT,                       -- JSON: BackboneState | null
  turn_count           INTEGER NOT NULL DEFAULT 0,
  title                TEXT,                       -- null until generated (free-chat only)
  -- Bounded attempt counter for lazy title-gen on free-chat rows: each retry
  -- bumps it; we stop trying after MAX_TITLE_ATTEMPTS. Without this a flaky
  -- model or empty reply re-fires Haiku on every sidebar load.
  title_attempts       INTEGER NOT NULL DEFAULT 0,
  completed_at         INTEGER,                    -- null while in progress
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

-- `seq` is a per-conversation monotonic ordering key. `created_at` alone is
-- millisecond-resolution and can tie when two messages land in the same ms
-- (retries, rapid replays); `seq` gives messages a deterministic order.
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  course_id       TEXT NOT NULL,                   -- denormalized for cheap tenant filtering
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE (conversation_id, seq)
);

CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_enrollments_user ON enrollments(user_id);
CREATE INDEX idx_agents_course ON agents(course_id);
CREATE INDEX idx_voices_course ON voices(course_id);
CREATE INDEX idx_collections_course ON collections(course_id);
CREATE INDEX idx_collection_sources_collection ON collection_sources(collection_id, course_id);
CREATE INDEX idx_conversations_user_course ON conversations(user_id, course_id);
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, seq);
