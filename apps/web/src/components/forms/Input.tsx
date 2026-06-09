// Input / Textarea / Field — text controls and a label wrapper.
//
// Field supplies the mono uppercase label plus a hint/error line; Input and
// Textarea match the form reference (line border, accent focus ring). Styles
// live in ../css/Input.css (imported via components.css); no runtime <style>
// injection. Class prefix `ds-`, generic tokens only.

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export interface FieldProps {
  /** Mono uppercase label text. */
  label?: ReactNode;
  /** Helper text shown below (hidden when `error` is set). */
  hint?: ReactNode;
  /** Error text shown below in the accent ink. */
  error?: ReactNode;
  /** Append a required asterisk to the label. */
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children?: ReactNode;
}

/** Field — label + hint/error wrapper for any control. */
export function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  className = "",
  children,
}: FieldProps) {
  return (
    <div className={["ds-field", className].filter(Boolean).join(" ")}>
      {label && (
        <label className="ds-field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="ds-field__error">{error}</span>
      ) : hint ? (
        <span className="ds-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Accent invalid border. */
  invalid?: boolean;
  /** Render in the mono face (codes, IDs, join codes). */
  mono?: boolean;
}

/** Input — single-line text input. */
export function Input({ invalid = false, mono = false, className = "", ...rest }: InputProps) {
  const cls = [
    "ds-input",
    invalid ? "ds-input--invalid" : "",
    mono ? "ds-input--mono" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <input className={cls} aria-invalid={invalid || undefined} {...rest} />;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Accent invalid border. */
  invalid?: boolean;
}

/** Textarea — multi-line text input, vertically resizable. */
export function Textarea({ invalid = false, className = "", ...rest }: TextareaProps) {
  const cls = ["ds-textarea", invalid ? "ds-textarea--invalid" : "", className]
    .filter(Boolean)
    .join(" ");
  return <textarea className={cls} aria-invalid={invalid || undefined} {...rest} />;
}
