import { Badge } from "../../../components/index.js";
import type { BoardStatus } from "../api.js";

/** A board's state, as every list shows it. */
export function StatusBadge({ status }: { status: BoardStatus }) {
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
