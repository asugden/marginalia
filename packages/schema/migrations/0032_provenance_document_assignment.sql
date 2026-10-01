-- 0032 — Writing documents belong to an assignment, going forward.
--
-- Until now a document was free-standing and met an assignment only at
-- submission time, when the student picked one in the Submit dialog. That kept
-- the writing tool student-first, but it left every assignment link pointing
-- at a generic document list, with no way to open "my paper for this
-- assignment". New documents are now created inside an assignment, the way a
-- code notebook is (code_notebooks.assignment_id).
--
-- Existing rows are left exactly as they are. There is NO backfill: documents
-- written before this migration keep assignment_id NULL and keep working —
-- open, edit, submit with or without an assignment — as before. Only the
-- create path changes (the worker requires an assignment for new documents).
--
-- One document per student per assignment, enforced here so two tabs opening
-- the same assignment at once can't fork a student's work.

ALTER TABLE provenance_documents
  ADD COLUMN assignment_id TEXT REFERENCES provenance_assignments(id);

CREATE UNIQUE INDEX idx_provenance_documents_owner_assignment
  ON provenance_documents(owner_user_id, assignment_id)
  WHERE assignment_id IS NOT NULL;
