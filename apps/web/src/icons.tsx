// Inline icon set (v0.7 §3.16). One file, hand-copied from Heroicons outline
// (24×24, 1.5px stroke). No runtime dependency on an icon library.
//
// Usage: <SignOutIcon className="icon" aria-hidden /> inside an .icon-button
// that carries title="Sign out" for the tooltip + accessible label.
//
// All icons share the same path: stroke="currentColor", fill="none", so
// colour follows the parent button's CSS colour.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SignOutIcon(props: IconProps) {
  // Heroicons "arrow-right-on-rectangle" simplified.
  return (
    <Icon {...props}>
      <path d="M15 12H3.75M3.75 12l3.75-3.75M3.75 12l3.75 3.75" />
      <path d="M9 4.5h6.75A2.25 2.25 0 0 1 18 6.75v10.5A2.25 2.25 0 0 1 15.75 19.5H9" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.5v15M4.5 12h15" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  // Heroicons "eye" (outline). Used by the instructor "previewing as student"
  // banner so the mode reads as a system affordance.
  return (
    <Icon {...props}>
      <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h15" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.25 6h13.5M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
      <path d="M6.75 6l.75 12.75A1.5 1.5 0 0 0 9 20.25h6a1.5 1.5 0 0 0 1.5-1.5L17.25 6" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 9h9.75A1.5 1.5 0 0 1 20.25 10.5v9.75A1.5 1.5 0 0 1 18.75 21.75H9A1.5 1.5 0 0 1 7.5 20.25V10.5A1.5 1.5 0 0 1 9 9z" />
      <path d="M16.5 9V3.75A1.5 1.5 0 0 0 15 2.25H5.25A1.5 1.5 0 0 0 3.75 3.75V13.5A1.5 1.5 0 0 0 5.25 15H7.5" />
    </Icon>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487z" />
      <path d="M19.5 7.125 16.875 4.5" />
    </Icon>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 18.75 8.25 12 15 5.25" />
    </Icon>
  );
}

// ── Extended set: icons used across the chat / author / attendance /
//    document surfaces. All Heroicons-outline style, 24×24, currentColor. ──

export function ArrowIcon(props: IconProps) {
  // Forward arrow (→) for CTAs like "Start" / "Continue".
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Icon>
  );
}

export function ArrowUpIcon(props: IconProps) {
  // Upward send arrow (↑) for the composer send button.
  return (
    <Icon strokeWidth={2.1} {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </Icon>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 7v5l3 2" />
      <path d="M3.5 12a8.5 8.5 0 1 0 2.4-5.9M3.5 4v3h3" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 21l-4.3-4.3" />
      <path d="M16.5 10.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0z" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.4} {...props}>
      <path d="M4 12l5 5L20 6" />
    </Icon>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18a1 1 0 0 1 1 1v13.5" />
      <path d="M19 18.5H6a2 2 0 0 0-2 2V5.5" />
      <path d="M19 18.5a2 2 0 0 1 0 2H6" />
    </Icon>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z" />
      <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 19a4 4 0 0 0-8 0" />
      <path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M20 19a3.5 3.5 0 0 0-4-3.4" />
      <path d="M4 19a3.5 3.5 0 0 1 4-3.4" />
    </Icon>
  );
}

export function DragIcon(props: IconProps) {
  // Six-dot drag handle for reorderable rows.
  return (
    <Icon strokeWidth={2.4} {...props}>
      <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  // Down chevron (rotate via CSS for other directions).
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

export function DocIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 3v5h5" />
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v12M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </Icon>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 4H4v5" />
      <path d="M4 4l6 6" />
      <path d="M15 20h5v-5" />
      <path d="M20 20l-6-6" />
    </Icon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
      <path d="M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 21V4M5 4h11l-2 3 2 3H5" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.1} {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Icon>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L21 5" />
    </Icon>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.7 13.3 15.3 9.7M8.7 14.7l6.6 3.6" />
      <path d="M18 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    </Icon>
  );
}

export function StopIcon(props: IconProps) {
  // Filled stop square (streaming cancel).
  return (
    <svg
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function CursorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4l6 16 2.2-6.8L20 11 5 4z" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Icon>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 1 1 17-4z" />
    </Icon>
  );
}

export function PanelRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5z" />
      <path d="M15 4v16" />
    </Icon>
  );
}
