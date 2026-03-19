'use client';

import React from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react';

// -------------------------------------------------------
// Toolbar button
// -------------------------------------------------------
interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors',
        'text-white/60 hover:text-white hover:bg-white/[0.07]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
        'disabled:opacity-30 disabled:cursor-not-allowed',
        isActive ? 'bg-white/[0.1] text-white' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-white/10 mx-0.5" />;
}

// -------------------------------------------------------
// RichTextToolbar
// -------------------------------------------------------
interface RichTextToolbarProps {
  editor: Editor | null;
  onImageUpload?: () => void;
  onLinkAdd?: () => void;
  className?: string;
}

export function RichTextToolbar({
  editor,
  onImageUpload,
  onLinkAdd,
  className = '',
}: RichTextToolbarProps) {
  if (!editor) return null;

  const handleLink = () => {
    if (onLinkAdd) {
      onLinkAdd();
      return;
    }
    const previousUrl = editor.getAttributes('link').href as string;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-0.5 px-2 py-1.5',
        'border-b border-white/10 bg-white/[0.02]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Text formatting */}
      <ToolbarButton
        title="Bold (Ctrl+B)"
        isActive={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        title="Italic (Ctrl+I)"
        isActive={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        title="Underline (Ctrl+U)"
        isActive={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        title="Strikethrough"
        isActive={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        title="Inline code"
        isActive={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Headings */}
      <ToolbarButton
        title="Heading 2"
        isActive={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        title="Heading 3"
        isActive={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Lists */}
      <ToolbarButton
        title="Bulleted list"
        isActive={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        title="Numbered list"
        isActive={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        title="Blockquote"
        isActive={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Divider />

      {/* Link */}
      <ToolbarButton
        title="Add link"
        isActive={editor.isActive('link')}
        onClick={handleLink}
      >
        <Link className="h-3.5 w-3.5" />
      </ToolbarButton>

      {/* Image upload */}
      {onImageUpload && (
        <ToolbarButton title="Insert image" onClick={onImageUpload}>
          <ImageIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
      )}
    </div>
  );
}
