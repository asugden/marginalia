// Design-system component barrel. Import primitives from "../components".
// Styles load via components.css (imported by styles.css); importing a
// component does not separately pull its CSS.

export { Avatar } from "./core/Avatar.js";
export { Badge } from "./core/Badge.js";
export { Button } from "./core/Button.js";
export { Card } from "./core/Card.js";
export { IconButton } from "./core/IconButton.js";
export { Modal } from "./core/Modal.js";
export { ConfirmDialog } from "./core/ConfirmDialog.js";
export { useConfirm } from "./core/useConfirm.js";
export { Tag } from "./core/Tag.js";
export { Tooltip } from "./core/Tooltip.js";
export { Wordmark } from "./core/Wordmark.js";
export { RoleSwitch } from "./RoleSwitch.js";
export { PreviewBanner } from "./PreviewBanner.js";
export { StudentModuleNav, studentModules } from "./StudentModuleNav.js";
export { CourseSwitcher } from "./CourseSwitcher.js";

export { ChatComposer } from "./chat/ChatComposer.js";
export { Message, ThinkingDots } from "./chat/Message.js";
export { CitationPill, SourcesStrip } from "./chat/CitationPill.js";

export { Field, Input, Textarea } from "./forms/Input.js";
export { Select } from "./forms/Select.js";
export { Dropdown } from "./forms/Dropdown.js";
export type { DropdownOption } from "./forms/Dropdown.js";
export { Checkbox, Switch } from "./forms/Checkbox.js";
export { RadioCard, RadioCardGroup } from "./forms/RadioCard.js";

export { OutlineRail } from "./navigation/OutlineRail.js";
export { SegmentedControl } from "./navigation/SegmentedControl.js";

// Layout primitives — the shared page-composition building blocks (docs/style.md
// §8–9): the page-title lockup, the canonical section header, the one hairline,
// and the stat tiles. Pages compose these instead of hand-rolling class strings.
export { Section, SubLabel } from "./layout/Section.js";
export { PageHeader } from "./layout/PageHeader.js";
export { Divider } from "./layout/Divider.js";
export { StatTile, StatGrid } from "./layout/StatTile.js";
