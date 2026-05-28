// v1.0 §7.1 — DEPRECATED.
//
// This constant was the v0.1 single-tenant placeholder. The shared-core
// pages (HomePage, ConversationPage, all staff pages) and the attendance
// module have been migrated to course-context routing — they read the
// courseId from /api/me, the URL, or a fetched conversation row.
//
// The provenance module still imports this constant. Its session owns
// the migration off it; after that, this file (and the import path) can
// be deleted. Do not add new importers.
//
// Value matches the seeded course id so any unmigrated path continues
// to function in development.
export const DEMO_COURSE = "course_demo";
