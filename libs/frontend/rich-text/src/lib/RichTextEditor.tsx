'use client';

import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { RichTextToolbar } from './RichTextToolbar';
import type { MentionItem } from './MentionList';

// -------------------------------------------------------
// Props
// -------------------------------------------------------
export interface RichTextEditorProps {
  /** Serialised HTML initial content */
  content?: string;
  onChange?: (html: string) => void;
  /** Called with Tiptap JSON — use this for backend @mention parsing */
  onJsonChange?: (json: object) => void;
  placeholder?: string;
  /** Called when user pastes or uploads an image file. Must return the public URL. */
  onImageUpload?: (file: File) => Promise<string>;
  /**
   * If provided, enables @-mention support.
   * Pass the same array / async function you use for suggestions.
   */
  mentionItems?: MentionItem[] | ((query: string) => MentionItem[] | Promise<MentionItem[]>);
  /** Extra class names applied to the outer wrapper */
  className?: string;
  /** Whether the editor is read-only */
  editable?: boolean;
}

// -------------------------------------------------------
// RichTextEditor
// -------------------------------------------------------
export function RichTextEditor({
  content = '',
  onChange,
  placeholder = 'Start typing…',
  onImageUpload,
  onJsonChange,
  mentionItems,
  className = '',
  editable = true,
}: RichTextEditorProps) {
  // Lazily build mention extension to avoid a circular dep if not needed
  const buildExtensions = useCallback((): Extensions => {
    const extensions: Extensions = [
      StarterKit,
      Underline,
      Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: 'tiptap-image' },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder }),
    ];

    if (mentionItems) {
      // Dynamic import to tree-shake when not used
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { buildMentionExtension } = require('./MentionList') as typeof import('./MentionList');
      const fetchSuggestions =
        typeof mentionItems === 'function'
          ? mentionItems
          : (query: string) => {
              const q = query.toLowerCase();
              return (mentionItems as MentionItem[])
                .filter((i) => i.label.toLowerCase().includes(q))
                .slice(0, 8);
            };
      extensions.push(buildMentionExtension({ fetchSuggestions }));
    }

    return extensions;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholder]);

  const editor = useEditor({
    extensions: buildExtensions(),
    content,
    editable,
    onUpdate({ editor: e }) {
      onChange?.(e.getHTML());
      onJsonChange?.(e.getJSON());
    },
  });

  // -------------------------------------------------------
  // Clipboard paste handler — images only
  // -------------------------------------------------------
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!onImageUpload || !editor) return;

      const items = Array.from(event.clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      event.preventDefault();

      onImageUpload(file).then((url) => {
        if (url) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      });
    },
    [editor, onImageUpload],
  );

  // -------------------------------------------------------
  // Toolbar image upload trigger
  // -------------------------------------------------------
  const handleToolbarImageUpload = useCallback(() => {
    if (!onImageUpload || !editor) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await onImageUpload(file);
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    };
    input.click();
  }, [editor, onImageUpload]);

  return (
    <div
      className={[
        'tiptap-editor',
        'bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden',
        'focus-within:border-white/20',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {editable && (
        <RichTextToolbar
          editor={editor}
          onImageUpload={onImageUpload ? handleToolbarImageUpload : undefined}
        />
      )}
      <div onPaste={handlePaste}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
