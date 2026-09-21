// The student-facing statement of what this module records.
//
// It is a shared component rather than duplicated prose for one reason: the
// wording has to stay accurate to the mechanism, and two copies drift. Both
// student-facing surfaces (the course examples list and the strip on an
// example page) render this, so changing the mechanism means changing exactly
// one string.
//
// If you change what the worker stores, change this text in the same commit.
// It is not boilerplate — it is the description the whole arrangement rests
// on. See apps/worker/src/modules/examples/README.md.

export interface RecordingNoticeProps {
  /** `compact` is the one-line form used inside the example-page strip, where
   *  vertical space is borrowed from someone else's page. */
  variant?: "full" | "compact";
}

export function RecordingNotice({ variant = "full" }: RecordingNoticeProps) {
  if (variant === "compact") {
    return (
      <p className="ex-notice ex-notice--compact">
        Your instructor sees that the class opened this, not who. Only “Mark
        complete” is recorded against your name.
      </p>
    );
  }
  return (
    <p className="ex-notice">
      <strong>What gets recorded.</strong> Your instructor can see that an
      example was opened by the class, and roughly when — but not who opened it,
      and not how long anyone spent. Marking an example complete is the only
      thing recorded against your name, it only happens when you press the
      button, and you can un-mark it at any time.
    </p>
  );
}
