// Moving between submissions on the staff review pages.
//
//   npx tsx src/course/reviewGrid.test.ts

import { buildReviewGrid, codeKey, navFromAssignment, navFromSubmission, writingKey } from "./reviewGrid.js";
import type { AssignmentDTO, CourseSubmissionSummary } from "../modules/provenance/api.js";
import type { CodeAssignmentDTO, LatestSubmissionDTO } from "../modules/code/api.js";

let failures = 0;
let checks = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`ok    ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${e}\n      actual   ${a}`);
  }
}

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 8, 1);

const essay = {
  id: "pasg_1", courseId: "c", title: "Essay", instructions: "Write 500 words.",
  checkpoints: [
    { id: "pcp_draft", name: "Draft", dueAt: t0 + 2 * DAY },
    { id: "pcp_final", name: "Final", dueAt: t0 + 6 * DAY },
  ],
  archivedAt: null, createdAt: t0, updatedAt: t0, chatEnabled: false, lockedAgentId: null,
} as unknown as AssignmentDTO;

const code = (id: string, dueAt: number | null, extra: Partial<CodeAssignmentDTO> = {}) =>
  ({ id, courseId: "c", title: id, instructions: "", dueAt, mode: "submit", archivedAt: null, ...extra }) as CodeAssignmentDTO;

const wsub = (token: string, user: string, checkpointId: string, at: number, extra: Partial<CourseSubmissionSummary> = {}) =>
  ({
    token, documentId: `doc_${user}`, title: "t", createdAt: at, revokedAt: null,
    studentUserId: user, studentEmail: `${user}@x`, studentName: user, readBy: [],
    assignmentId: "pasg_1", assignmentTitle: "Essay", checkpointId, checkpointName: "", late: false,
    ...extra,
  }) as CourseSubmissionSummary;

const csub = (id: string, user: string, assignmentId: string): LatestSubmissionDTO => ({
  id, assignmentId, userId: user, email: `${user}@x`, displayName: user, submittedAt: t0,
});

const grid = buildReviewGrid({
  courseId: "c",
  writing: [essay],
  // Server order: newest first.
  writingSubs: [
    wsub("w_bob2", "bob", "pcp_draft", t0 + 3 * DAY),
    wsub("w_amy", "amy", "pcp_draft", t0 + 2 * DAY),
    wsub("w_bob1", "bob", "pcp_draft", t0 + 1 * DAY),
    wsub("w_cy", "cy", "pcp_draft", t0, { revokedAt: t0 + DAY }),
    wsub("w_amyF", "amy", "pcp_final", t0 + 5 * DAY),
  ],
  code: [
    code("hw1", t0 + 4 * DAY, { instructions: "Plot it." }),
    code("practice", t0 + 3 * DAY, { mode: "practice" }),
    code("undated", null),
  ],
  codeSubs: [csub("cs_cy", "cy", "hw1"), csub("cs_amy", "amy", "hw1"), csub("cs_u", "amy", "undated")],
});

check(
  "dated assignments in deadline order; practice and undated left out",
  grid.dated.map((a) => a.key),
  [writingKey("pcp_draft"), codeKey("hw1"), writingKey("pcp_final")],
);
check("a checkpoint of a multi-checkpoint assignment is titled with its name", grid.byKey.get(writingKey("pcp_draft"))!.title, "Essay — Draft");
check(
  "writing entries follow the checkpoint page: newest first, one per document, revoked dropped",
  grid.byKey.get(writingKey("pcp_draft"))!.entries.map((e) => e.submissionId),
  ["w_bob2", "w_amy"],
);
check(
  "code entries follow the roster: by name",
  grid.byKey.get(codeKey("hw1"))!.entries.map((e) => e.userId),
  ["amy", "cy"],
);

const fromAmy = navFromSubmission(grid, { key: codeKey("hw1"), userId: "amy", submissionId: "cs_amy" })!;
check("position among the assignment's students", fromAmy.position, { index: 1, of: 2 });
check("no previous student at the start", fromAmy.prev, null);
check("next student", fromAmy.next?.label, "cy");
check("up: the same student's work in the earlier assignment", fromAmy.up?.href, "/s/w_amy");
check("down: the same student's work in the later assignment", fromAmy.down?.href, "/s/w_amyF");

const fromCy = navFromSubmission(grid, { key: codeKey("hw1"), userId: "cy", submissionId: "cs_cy" })!;
check(
  "up falls back to the assignment's page when the student has nothing there",
  [fromCy.up?.href, fromCy.up?.label],
  ["/course/c/instructor/submissions/writing/pasg_1/pcp_draft", "Essay — Draft (nothing submitted)"],
);

const earlier = navFromSubmission(grid, { key: writingKey("pcp_draft"), userId: "bob", submissionId: "w_bob1" })!;
check("an earlier snapshot stands in its student's place", earlier.position, { index: 1, of: 2 });
check("no up from the earliest assignment", earlier.up, null);

const undated = navFromSubmission(grid, { key: codeKey("undated"), userId: "amy", submissionId: "cs_u" })!;
check("an undated assignment still steps between students, but not up or down", [undated.position, undated.up, undated.down], [{ index: 1, of: 1 }, null, null]);

check("an unknown assignment offers no moves", navFromSubmission(grid, { key: "w:gone", userId: "amy", submissionId: "x" }), null);

const page = navFromAssignment(grid, writingKey("pcp_final"))!;
check("assignment page: up to the previous assignment's page", page.up?.href, "/course/c/instructor/submissions/code/hw1");
check("assignment page: nothing after the last", page.down, null);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
