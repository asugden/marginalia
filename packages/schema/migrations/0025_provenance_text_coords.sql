-- 0025 — provenance: log edits in plain-text coordinates.
--
-- The writing tool used to log each edit's offset as a rich-text editor
-- position. Replay compares against plain text, where a paragraph break is one
-- "\n" but two editor positions, and text starts at offset 0 but position 1.
-- Every paragraph therefore added a phantom character: origin marks slid off
-- their words further down a document, and long documents reported length
-- drift, which an instructor sees as "characters the log doesn't account for"
-- on an innocent student's work.
--
-- New documents log offsets into the plain-text projection itself (see
-- @marginalia/provenance projection.ts), so replay lines up by construction.
--
-- Existing documents keep the old coordinates. Their logs already hold
-- position-based offsets that can't be converted after the fact (the mapping
-- depends on the document's structure at each moment, which isn't stored), and
-- mixing the two systems in one log would be worse than either. So the column
-- defaults to 'pm' for every existing row, and only rows created from here on
-- are written as 'text'. Submissions already minted are frozen renders and are
-- untouched either way.

ALTER TABLE provenance_documents
  ADD COLUMN event_coords TEXT NOT NULL DEFAULT 'pm';
