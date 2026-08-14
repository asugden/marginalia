// Tiptap-based editor for the provenance module.
// Slice 2: + per-character origin tracking via the OriginMark + ProvenanceTracker
// extensions. Inserted text is stamped with origin="human" by default; pastes
// flip to origin="pasted". Coloring is pure CSS (see styles.css).

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import type { JSONContent, Editor } from "@tiptap/react";
import { OriginMark } from "./OriginMark.js";
import { ProvenanceTracker, type TrackedEvent } from "./ProvenanceTracker.js";

const WORDS_PER_PAGE = 250;

export interface EditorChange {
  bodyJson: JSONContent;
  wordCount: number;
  charCount: number;
}

interface Props {
  initialContent: JSONContent;
  onChange: (change: EditorChange) => void;
  /** Called whenever the tracker observes one or more edits. */
  onEvents?: (events: TrackedEvent[]) => void;
  /** Fires once the editor instance is ready; receives null on teardown.
   *  Slice 4 uses this so the ChatPanel can call editor.commands.insertLlmText. */
  onEditorReady?: (editor: Editor | null) => void;
  /** When true, suppress origin coloring (the "hide marks from students"
   *  toggle). Recording is unaffected — this is display-only. The footer
   *  legend is hidden too, since there are no colors to explain. */
  hideMarks?: boolean;
  /** When the chat pane is open, the editor offers a "Reference" action on a
   *  text selection that hands the selected passage to the chat as a quote.
   *  Hidden entirely when the chat is closed. */
  chatOpen?: boolean;
  /** Called with the selected passage when the student clicks "Reference". */
  onReference?: (text: string) => void;
}

// Selection length cap for "Reference". A hard floor of 1500 chars, nudged up
// a little for long documents (so a long essay can quote a slightly longer
// passage), but firmly bounded. When a selection exceeds the cap, the
// Reference button simply does not appear — no message, no explanation. This
// is a deliberate, quiet nudge away from wholesale "reference everything"
// behaviour and toward quoting only the passage that matters.
const REFERENCE_MIN_CAP = 1500;
const REFERENCE_MAX_CAP = 4000;
function referenceCap(docChars: number): number {
  const scaled = REFERENCE_MIN_CAP + Math.floor(docChars * 0.1);
  return Math.min(REFERENCE_MAX_CAP, Math.max(REFERENCE_MIN_CAP, scaled));
}

export function ProvenanceEditor({
  initialContent,
  onChange,
  onEvents,
  onEditorReady,
  hideMarks = false,
  chatOpen = false,
  onReference,
}: Props) {
  // Keep the latest onEvents in a ref so the tracker plugin (configured once
  // at editor construction) always sees the current callback.
  const onEventsRef = useRef<Props["onEvents"]>(onEvents);
  useEffect(() => {
    onEventsRef.current = onEvents;
  }, [onEvents]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      CharacterCount.configure({}),
      OriginMark,
      ProvenanceTracker.configure({
        onEvents: (events) => onEventsRef.current?.(events),
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange(snapshot(editor));
    },
  });

  // If the initialContent prop changes after first mount (e.g. switching docs
  // without remounting), reset the editor to the new content. We don't fire
  // onChange for this so we don't immediately re-save what we just loaded.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(initialContent)) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
      // Re-seed the reversion index from the newly-loaded document's LLM runs
      // (onCreate only fires for the first document on this editor instance).
      editor.commands.rehydrateLlmContributions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent, editor]);

  // Expose / retract the editor instance to the parent for imperative actions
  // (e.g. ChatPanel "Insert at cursor"). Fires on mount when editor becomes
  // available, and again on unmount with null so refs are cleaned up.
  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => onEditorReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return <div className="prov-editor-surface-wrap" />;

  const wordCount = editor.storage.characterCount.words();
  const charCount = editor.storage.characterCount.characters();
  const pageCount = Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE));

  // Selected passage + whether it's eligible to "Reference" into the chat.
  // The button only renders when the chat is open, something is selected, and
  // the selection is within the (doc-length-scaled) cap. Over the cap → the
  // button silently disappears.
  const { from, to } = editor.state.selection;
  const selectedText =
    from === to ? "" : editor.state.doc.textBetween(from, to, " ").trim();
  const canReference =
    chatOpen &&
    !!onReference &&
    selectedText.length > 0 &&
    selectedText.length <= referenceCap(charCount);

  function doReference() {
    if (!canReference) return;
    onReference!(selectedText);
    // Collapse the selection so the bubble menu dismisses after referencing.
    editor.chain().focus().setTextSelection(to).run();
  }

  return (
    <div className={`prov-editor-surface-wrap${hideMarks ? " prov-marks-hidden" : ""}`}>
      <BubbleMenu editor={editor} className="prov-bubble-menu">
        <ToolbarButton
          editor={editor}
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <span className="prov-bubble-sep" aria-hidden />
        <ToolbarButton
          editor={editor}
          isActive={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          label="Heading 1"
        >
          H<sub>1</sub>
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          isActive={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          label="Heading 2"
        >
          H<sub>2</sub>
        </ToolbarButton>
        <span className="prov-bubble-sep" aria-hidden />
        <ToolbarButton
          editor={editor}
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Bullet list"
        >
          •
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="Numbered list"
        >
          1.
        </ToolbarButton>
        {canReference && (
          <>
            <span className="prov-bubble-sep" aria-hidden />
            <button
              type="button"
              className="prov-bubble-button prov-bubble-reference"
              onClick={doReference}
              aria-label="Reference this passage in the chat"
              title="Reference this passage in the chat"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 7h4v4c0 2.2-1.3 3.7-3.5 4.3l-.5-1.3c1.3-.4 2-1.1 2-2H7V7zm6 0h4v4c0 2.2-1.3 3.7-3.5 4.3l-.5-1.3c1.3-.4 2-1.1 2-2h-2V7z" />
              </svg>
              Reference
            </button>
          </>
        )}
      </BubbleMenu>

      <EditorContent editor={editor} className="prov-editor-surface" />

      <footer className="prov-editor-counts">
        <span className="prov-editor-counts-stats">
          <span><strong>{wordCount.toLocaleString()}</strong> words</span>
          <span className="prov-counts-sep" aria-hidden />
          <span><strong>{charCount.toLocaleString()}</strong> characters</span>
          <span className="prov-counts-sep" aria-hidden />
          <span>~{pageCount} page{pageCount === 1 ? "" : "s"}</span>
        </span>
        {!hideMarks && (
          <span className="prov-editor-legend" aria-label="Word-origin legend">
            <Swatch className="legend-human" label="typed" />
            <Swatch className="legend-pasted" label="pasted" />
            <Swatch className="legend-llm" label="from LLM" />
            <Swatch className="legend-edited" label="autocorrect" />
          </span>
        )}
      </footer>
    </div>
  );
}

function ToolbarButton({
  editor: _editor,
  isActive,
  onClick,
  label,
  children,
}: {
  editor: Editor;
  isActive: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`prov-bubble-button${isActive ? " is-active" : ""}`}
      aria-label={label}
      aria-pressed={isActive}
    >
      {children}
    </button>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="prov-legend-item">
      <span className={`prov-legend-swatch ${className}`} aria-hidden />
      {label}
    </span>
  );
}

function snapshot(editor: Editor): EditorChange {
  return {
    bodyJson: editor.getJSON(),
    wordCount: editor.storage.characterCount.words(),
    charCount: editor.storage.characterCount.characters(),
  };
}
