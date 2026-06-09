// ChatComposer — the signature message bar at the heart of every tool.
// Auto-growing textarea, spring-in send button, accent focus glow. Enter
// sends, Shift+Enter newlines. Uncontrolled by default; pass value/onChange
// to control.
//
// Styles live in ../css/ChatComposer.css (imported via components.css); this
// file is markup + props only. Authored against the generic token layer, so a
// branded deploy re-tints the accent — no brand-specific colour literal here.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const SendArrow = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export interface ChatComposerProps {
  placeholder?: string;
  disabled?: boolean;
  /** Controlled value. Omit for uncontrolled (internal state). */
  value?: string;
  onChange?: (value: string) => void;
  /** Called with the trimmed text when the user sends. */
  onSend?: (text: string) => void;
  /** Optional leading affordance icon (e.g. attach/plus). */
  leadIcon?: ReactNode;
  onLead?: () => void;
  /** Replace the default footer row (hint text). Pass null to hide content. */
  footer?: ReactNode;
  className?: string;
}

export function ChatComposer({
  placeholder = "Message…",
  disabled = false,
  value,
  onChange,
  onSend,
  leadIcon,
  onLead,
  footer,
  className = "",
}: ChatComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [internal, setInternal] = useState("");
  const controlled = value !== undefined;
  const text = controlled ? value : internal;

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

  const setText = (v: string) => {
    if (controlled) onChange?.(v);
    else setInternal(v);
  };
  const ready = text.trim().length > 0 && !disabled;

  const send = () => {
    if (!ready) return;
    onSend?.(text.trim());
    if (!controlled) setInternal("");
  };

  return (
    <div
      className={["ds-composer", ready ? "ds-composer--ready" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="ds-composer__field">
        {leadIcon && (
          <button
            type="button"
            className="ds-composer__lead"
            onClick={onLead}
            tabIndex={-1}
            aria-label="Add"
          >
            {leadIcon}
          </button>
        )}
        <textarea
          ref={taRef}
          className="ds-composer__textarea"
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          className="ds-composer__send"
          onClick={send}
          disabled={!ready}
          aria-label="Send message"
        >
          <SendArrow />
        </button>
      </div>
      {footer !== undefined ? (
        <div className="ds-composer__footer">{footer}</div>
      ) : (
        <div className="ds-composer__footer">
          <span>Responses follow the agent&rsquo;s rules</span>
          <span>
            <kbd>Enter</kbd> to send
          </span>
        </div>
      )}
    </div>
  );
}
