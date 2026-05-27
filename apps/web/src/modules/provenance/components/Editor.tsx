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
}

export function ProvenanceEditor({ initialContent, onChange, onEvents }: Props) {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent, editor]);

  if (!editor) return <div className="provenance-editor" />;

  const wordCount = editor.storage.characterCount.words();
  const charCount = editor.storage.characterCount.characters();
  const pageCount = Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE));

  return (
    <div className="provenance-editor">
      <BubbleMenu editor={editor} className="provenance-bubble">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive("bold") ? "is-active" : ""}
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive("italic") ? "is-active" : ""}
          aria-label="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive("heading", { level: 1 }) ? "is-active" : ""}
          aria-label="Heading 1"
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive("heading", { level: 2 }) ? "is-active" : ""}
          aria-label="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive("bulletList") ? "is-active" : ""}
          aria-label="Bullet list"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive("orderedList") ? "is-active" : ""}
          aria-label="Numbered list"
        >
          1.
        </button>
      </BubbleMenu>

      <EditorContent editor={editor} className="provenance-editor-surface" />

      <footer className="provenance-counts">
        <span>{wordCount.toLocaleString()} words</span>
        <span>{charCount.toLocaleString()} characters</span>
        <span>
          ~{pageCount} page{pageCount === 1 ? "" : "s"}
        </span>
        <span className="provenance-legend">
          <span className="legend-swatch legend-human" /> typed
          <span className="legend-swatch legend-pasted" /> pasted
          <span className="legend-swatch legend-llm" /> from chat
        </span>
      </footer>
    </div>
  );
}

function snapshot(editor: Editor): EditorChange {
  return {
    bodyJson: editor.getJSON(),
    wordCount: editor.storage.characterCount.words(),
    charCount: editor.storage.characterCount.characters(),
  };
}
