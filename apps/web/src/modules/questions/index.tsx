// Questions module entry. Pages are imported via this barrel so the main
// router only needs one import path per route. See ./README.md.

import { BoardPage } from "./components/BoardPage.js";

export { StaffBoardsPage } from "./components/StaffBoardsPage.js";
export { StudentBoardsPage } from "./components/StudentBoardsPage.js";
export { LiveBoardButton } from "./components/LiveBoardButton.js";

export function StudentBoardPage() {
  return <BoardPage />;
}

export function StaffBoardPage() {
  return <BoardPage staffShell />;
}
