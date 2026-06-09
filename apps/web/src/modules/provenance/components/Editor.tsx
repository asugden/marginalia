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
}

export function ProvenanceEditor({
  initialContent,
  onChange,
  onEvents,
  onEditorReady,
  hideMarks = false,
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
            <Swatch className="legend-llm" label="from chat" />
            <Swatch className="legend-edited" label="edited" />
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
