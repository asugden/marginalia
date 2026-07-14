// Design-system component barrel. Import primitives from "../components".
// Styles load via components.css (imported by styles.css); importing a
// component does not separately pull its CSS.

export { Avatar } from "./core/Avatar.js";
export { Badge } from "./core/Badge.js";
export { Button } from "./core/Button.js";
export { Card } from "./core/Card.js";
export { IconButton } from "./core/IconButton.js";
export { Tag } from "./core/Tag.js";
export { Wordmark } from "./core/Wordmark.js";
export { RoleSwitch } from "./RoleSwitch.js";
export { PreviewBanner } from "./PreviewBanner.js";
export { StudentModuleNav, studentModules } from "./StudentModuleNav.js";

export { ChatComposer } from "./chat/ChatComposer.js";
export { Message, ThinkingDots } from "./chat/Message.js";
export { CitationPill, SourcesStrip } from "./chat/CitationPill.js";

export { Field, Input, Textarea } from "./forms/Input.js";
export { Select } from "./forms/Select.js";
export { Checkbox, Switch } from "./forms/Checkbox.js";
export { RadioCard, RadioCardGroup } from "./forms/RadioCard.js";

export { OutlineRail } from "./navigation/OutlineRail.js";
export { SegmentedControl } from "./navigation/SegmentedControl.js";
