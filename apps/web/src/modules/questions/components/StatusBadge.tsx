import { Badge } from "../../../components/index.js";
import type { SessionStatus } from "../api.js";

/** A session's state, as every list and header shows it. */
export function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === "open") {
    return (
      <Badge tone="success" dot>
        Open
      </Badge>
    );
  }
  if (status === "draft") return <Badge tone="warning">Draft</Badge>;
  return <Badge tone="neutral">Closed</Badge>;
}
