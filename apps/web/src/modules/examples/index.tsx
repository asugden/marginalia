// Examples module entry. Pages are imported via this barrel so the main
// router only needs one import path per route.
// See ./README.md for the UX shape and the privacy split it implements.

export { StudentExamplesPage } from "./components/StudentExamplesPage.js";
export { InstructorExamplesPage } from "./components/InstructorExamplesPage.js";
// Mounted inside individual example pages, not routed. Renders nothing unless
// the URL carries ?c=<courseId> and the viewer is enrolled in that course.
export { ExampleCourseStrip } from "./components/ExampleCourseStrip.js";
export { RecordingNotice } from "./components/RecordingNotice.js";
