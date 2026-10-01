// Cell-by-cell test of the permission table. If this file changes, the
// table's comment in permissions.ts should change with it.

import {
  assignableRoles,
  can,
  canAssignRole,
  canCreateCourses,
  isStaff,
  type Capability,
} from "./permissions.js";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

const CAPS: Capability[] = [
  "author",
  "manage_students",
  "view_submissions",
  "run_attendance",
  "manage_staff",
];
const EXPECTED: Record<string, Capability[]> = {
  instructor: CAPS,
  ta: ["manage_students", "view_submissions", "run_attendance"],
  student: [],
};

for (const [role, caps] of Object.entries(EXPECTED)) {
  for (const cap of CAPS) {
    check(`${role} ${caps.includes(cap) ? "can" : "cannot"} ${cap}`, can(role, cap), caps.includes(cap));
  }
}

// Unknown / missing roles hold nothing.
for (const cap of CAPS) {
  check(`null role cannot ${cap}`, can(null, cap), false);
  check(`unknown role cannot ${cap}`, can("owner", cap), false);
}

check("instructor is staff", isStaff("instructor"), true);
check("ta is staff", isStaff("ta"), true);
check("student is not staff", isStaff("student"), false);

check("admin assigns any role", assignableRoles({ role: null, isAdmin: true }), ["student", "ta", "instructor"]);
check("instructor assigns ta + student", assignableRoles({ role: "instructor", isAdmin: false }), ["student", "ta"]);
check("ta assigns student", assignableRoles({ role: "ta", isAdmin: false }), ["student"]);
check("student assigns nothing", assignableRoles({ role: "student", isAdmin: false }), []);
check("instructor cannot assign instructor", canAssignRole({ role: "instructor", isAdmin: false }, "instructor"), false);
check("ta cannot assign ta", canAssignRole({ role: "ta", isAdmin: false }, "ta"), false);
check("admin-instructor can assign instructor", canAssignRole({ role: "instructor", isAdmin: true }, "instructor"), true);

check("admin creates courses without flag", canCreateCourses({ isAdmin: true, canCreateCourses: false }), true);
check("flagged user creates courses", canCreateCourses({ isAdmin: false, canCreateCourses: true }), true);
check("unflagged user cannot create courses", canCreateCourses({ isAdmin: false, canCreateCourses: false }), false);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
