// The student dashboard's model.
//
//   npx tsx src/course/studentWork.test.ts

import type { AgentSummary } from "../client.js";
import type { CourseItemDTO } from "../modules/course-items/api.js";
import { buildStudentWork, byDueDate, completedOrder, splitAtWeek, type StudentWorkInput } from "./studentWork.js";

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
const now = Date.UTC(2026, 9, 15, 15, 0);
const C = "course_x";

const item = (id: string, extra: Partial<CourseItemDTO>): CourseItemDTO => ({
  id, kind: "code", payloadRef: id, title: id, ord: 0, assignedAt: null, dueAt: null, note: null,
  archivedAt: null, dangling: false, payload: null, ...extra,
});
const agent = (id: string, extra: Partial<AgentSummary>): AgentSummary => ({
  id, title: id, hasBackbone: true, hasCollection: false, hasVariants: false, voice: null as never,
  updatedAt: 0, lastConversationId: null, lastUpdatedAt: null, lastCompletedAt: null, ...extra,
});

const input: StudentWorkInput = {
  courseId: C,
  now,
  titleOf: (i) => i.title,
  enabled: { writing: true, agents: true, code: true },
  items: [
    item("ci_essay", {
      kind: "writing", payloadRef: "pasg_essay", title: "Essay", ord: 1,
      payload: { checkpoints: [{ id: "cp_draft", name: "Draft", dueAt: now - 2 * DAY }, { id: "cp_final", name: "Final", dueAt: now + 5 * DAY }] },
      completion: { kind: "writing", submitted: true, checkpoints: ["cp_draft"] },
    }),
    item("ci_pset", { kind: "code", payloadRef: "casg_pset", title: "Problem set", dueAt: now + 1 * DAY, ord: 2,
      completion: { kind: "code", submitted: false } }),
    item("ci_old", { kind: "code", payloadRef: "casg_old", title: "Old set", dueAt: now - 3 * DAY, ord: 3,
      completion: { kind: "code", submitted: false } }),
    item("ci_guided", { kind: "agent", payloadRef: "ag_guided", title: "Guided agent", ord: 4,
      completion: { kind: "agent", finished: false } }),
    item("ci_draft", { kind: "code", payloadRef: "casg_draft", title: "Unpublished", archivedAt: now }),
  ],
  agents: [
    agent("ag_guided", { lastConversationId: "conv_1", lastUpdatedAt: now - DAY }),
    agent("ag_free", { title: "Free agent", hasBackbone: false, lastConversationId: "conv_2", lastUpdatedAt: now }),
  ],
  docs: [{ id: "doc_essay", assignmentId: "pasg_essay", wordCount: 420, updatedAt: now - 3_600_000 }],
  notebooks: [],
};

const work = buildStudentWork(input);
const byKey = Object.fromEntries(work.map((w) => [w.title, w]));

check(
  "every live item is listed; unpublished work is not",
  work.map((w) => w.title).sort(),
  ["Essay — Draft", "Essay — Final", "Free agent", "Guided agent", "Old set", "Problem set"],
);
check(
  "checkpoints are separate items but open the same document",
  [byKey["Essay — Draft"]!.href, byKey["Essay — Final"]!.href],
  [`/course/${C}/writing/assignment/pasg_essay`, `/course/${C}/writing/assignment/pasg_essay`],
);
check(
  "each checkpoint's state comes from that document's submissions",
  [byKey["Essay — Draft"]!.state, byKey["Essay — Final"]!.state],
  ["done", "started"],
);
check("a started document shows its progress", byKey["Essay — Final"]!.progress?.startsWith("420 words"), true);
check("nothing started reads as new", byKey["Problem set"]!.state, "new");
check("an unfinished past deadline is overdue", byKey["Old set"]!.overdue, true);
check("a done item is never overdue", byKey["Essay — Draft"]!.overdue, false);
check(
  "a guided agent in progress continues its conversation",
  [byKey["Guided agent"]!.state, byKey["Guided agent"]!.href, byKey["Guided agent"]!.newChatHref],
  ["started", `/course/${C}/chat/conv_1`, null],
);
check(
  "a free-form agent offers Continue and a new chat, and is never done",
  [byKey["Free agent"]!.state, byKey["Free agent"]!.href, byKey["Free agent"]!.newChatHref],
  ["started", `/course/${C}/chat/conv_2`, `/course/${C}/chat/new/ag_free`],
);
check(
  "to do, by due date: overdue first, then by deadline, undated last",
  byDueDate(work.filter((w) => w.state !== "done")).map((w) => w.title),
  ["Old set", "Problem set", "Essay — Final", "Guided agent", "Free agent"],
);
check(
  "explore holds open-ended agents and examples; dated or assigned work stays in to do",
  work.filter((w) => w.explore).map((w) => w.title).sort(),
  ["Free agent", "Guided agent"],
);
{
  const todo = byDueDate(work.filter((w) => w.state !== "done" && !w.explore));
  const { week, later } = splitAtWeek(todo, now);
  check("the week holds overdue work and what's due within 7 days", week.map((w) => w.title), ["Old set", "Problem set", "Essay — Final"]);
  const far = splitAtWeek(
    [{ ...todo[0]!, title: "Far", dueAt: now + 20 * DAY }, { ...todo[0]!, title: "Undated", dueAt: null }],
    now,
  );
  check("later deadlines and undated work wait behind More", [later.length, far.later.map((w) => w.title)], [0, ["Far", "Undated"]]);
}
check("completed holds the done items", completedOrder(work.filter((w) => w.state === "done")).map((w) => w.title), ["Essay — Draft"]);

{
  const finished = buildStudentWork({
    ...input,
    items: [],
    agents: [agent("ag_done", { title: "Done agent", lastConversationId: "c", lastCompletedAt: now - DAY })],
  });
  check("a guided agent that reached its end is done", [finished[0]!.state, finished[0]!.doneLabel], ["done", "finished"]);
}
{
  const off = buildStudentWork({ ...input, enabled: { writing: false, agents: false, code: true } });
  check("modules turned off are left out", off.map((w) => w.kind).sort(), ["code", "code"]);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
