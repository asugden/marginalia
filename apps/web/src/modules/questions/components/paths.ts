// Where the module's pages live. The student and staff shells mount the same
// pages under different roots; every link goes through here.

export function questionsBase(courseId: string, staffShell: boolean): string {
  return staffShell ? `/course/${courseId}/instructor/questions` : `/course/${courseId}/questions`;
}

export function sessionPath(courseId: string, staffShell: boolean, sessionId: string): string {
  return `${questionsBase(courseId, staffShell)}/${sessionId}`;
}

export function boardPath(courseId: string, staffShell: boolean, sessionId: string, boardId: string): string {
  return `${sessionPath(courseId, staffShell, sessionId)}/${boardId}`;
}
