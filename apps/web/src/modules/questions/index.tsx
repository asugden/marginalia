// Questions module entry. Pages are imported via this barrel so the main
// router only needs one import path per route. See ./README.md.
//
// Each page is mounted twice — under the student shell and the staff shell —
// and differs only in where its links point and which register it wears.

import { SessionPage } from "./components/SessionPage.js";
import { SessionsPage } from "./components/SessionsPage.js";

export { LiveSessionButton } from "./components/LiveSessionButton.js";

export const StudentSessionsPage = () => <SessionsPage />;
export const StudentSessionPage = () => <SessionPage />;
export const StaffSessionsPage = () => <SessionsPage staffShell />;
export const StaffSessionPage = () => <SessionPage staffShell />;
