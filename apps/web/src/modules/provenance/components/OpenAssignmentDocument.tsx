// /course/:courseId/writing/assignment/:assignmentId — open the student's
// document for a writing assignment, creating it the first time, then go to
// the editor. The writing parallel of the code module's OpenAssignmentNotebook:
// every link to a writing assignment (dashboard, writing list, the tour) comes
// through here, so a student always lands in their paper for that assignment.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { openAssignmentDocument } from "../api.js";

export function OpenAssignmentDocument() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!courseId || !assignmentId) return;
    openAssignmentDocument(courseId, assignmentId)
      .then((doc) => navigate(`/course/${courseId}/writing/${doc.id}`, { replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't open this assignment"));
  }, [courseId, assignmentId, navigate]);
  return (
    <div className="app-home__inner">
      {error ? <p className="error">{error}</p> : <p className="muted">Opening…</p>}
    </div>
  );
}
