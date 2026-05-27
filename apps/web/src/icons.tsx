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
