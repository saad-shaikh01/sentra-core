# NOTIF-010 — Tiptap Rich Text Editor Shared Component

## Overview
Build a shared `RichTextEditor` component using **Tiptap** with support for:
- Basic formatting: bold, italic, underline, strikethrough, bullet lists, ordered lists, headings
- **@mention**: user mention with search dropdown
- **Image support**: paste from clipboard (Ctrl+V), drag & drop, file upload button
- **File attachments**: non-image files (PDF, DOCX, etc.)
- Link insertion

This component goes in `libs/frontend/ui/src/` (existing shared UI lib) OR a new
`libs/frontend/rich-text/` lib. **Check if `libs/frontend/ui` already exists and has capacity — if it does, add there. If not, create `libs/frontend/rich-text`.**

## Prerequisites
- Can be implemented fully in parallel (no dependencies on other notification tickets)

## Packages to Install

Check `package.json` in each frontend app. Install these in the **workspace root** or the shared lib:

```bash
# Core Tiptap
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit

# Extensions needed
npm install @tiptap/extension-mention
npm install @tiptap/extension-image
npm install @tiptap/extension-link
npm install @tiptap/extension-placeholder
npm install @tiptap/extension-underline

# Mention dropdown UI (using existing Radix — no new deps needed if Radix is installed)
# Check if @radix-ui/react-popover is already installed
```

**IMPORTANT:** Check existing `package.json` before installing. Avoid duplicate/conflicting versions.

---

## Scope

```
libs/frontend/ui/src/components/rich-text/    (or libs/frontend/rich-text/src/)
├── RichTextEditor.tsx          ← main component
├── RichTextDisplay.tsx         ← read-only renderer (for displaying saved content)
├── MentionList.tsx             ← @mention suggestion dropdown
├── RichTextToolbar.tsx         ← formatting toolbar
└── rich-text-editor.css        ← Tiptap-specific styles
```

---

## Implementation Details

### RichTextEditor.tsx

```typescript
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { buildMentionExtension } from './MentionList';
import { RichTextToolbar } from './RichTextToolbar';
import './rich-text-editor.css';

export interface RichTextEditorProps {
  value?: object | null;             // Tiptap JSON (from editor.getJSON())
  onChange?: (json: object, text: string) => void;  // json for storage, text for search
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;               // CSS value e.g. '120px'
  maxHeight?: string;               // CSS value e.g. '400px'
  showToolbar?: boolean;            // default: true
  supportMentions?: boolean;        // default: false — only enable where @mentions needed
  mentionSearchUrl?: string;        // GET endpoint: /api/users/search?q=&orgId=
  mentionOrgId?: string;
  supportImages?: boolean;          // default: true
  imageUploadUrl?: string;          // POST endpoint for image upload
  imageUploadHeaders?: Record<string, string>;
  onImageUpload?: (file: File) => Promise<string>;  // returns URL
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something...',
  disabled = false,
  minHeight = '120px',
  maxHeight = '400px',
  showToolbar = true,
  supportMentions = false,
  mentionSearchUrl,
  mentionOrgId,
  supportImages = true,
  onImageUpload,
}: RichTextEditorProps) {
  const extensions = [
    StarterKit.configure({
      // Disable hardBreak (Enter = new paragraph, Shift+Enter = line break)
    }),
    Underline,
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder }),
    ...(supportImages ? [
      Image.configure({
        allowBase64: false,  // ALWAYS false — upload images, never base64
        HTMLAttributes: {
          class: 'max-w-full rounded-lg',
        },
      }),
    ] : []),
    ...(supportMentions && mentionSearchUrl ? [
      buildMentionExtension({ searchUrl: mentionSearchUrl, orgId: mentionOrgId ?? '' }),
    ] : []),
  ];

  const editor = useEditor({
    extensions,
    content: value ?? undefined,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON(), editor.getText());
    },
    editorProps: {
      handlePaste: (view, event) => {
        // Handle image paste from clipboard (Ctrl+V)
        if (!supportImages || !onImageUpload) return false;

        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));

        if (!imageItem) return false;

        event.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return false;

        // Upload then insert
        onImageUpload(file).then((url) => {
          editor?.chain().focus().setImage({ src: url }).run();
        }).catch((err) => {
          console.error('[RichTextEditor] Image upload failed:', err);
        });

        return true;  // handled
      },
      handleDrop: (view, event, slice, moved) => {
        // Handle image drag & drop
        if (!supportImages || !onImageUpload || moved) return false;

        const files = Array.from(event.dataTransfer?.files ?? []);
        const imageFile = files.find((f) => f.type.startsWith('image/'));

        if (!imageFile) return false;

        event.preventDefault();
        onImageUpload(imageFile).then((url) => {
          editor?.chain().focus().setImage({ src: url }).run();
        });

        return true;
      },
    },
  });

  if (!editor) return null;

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-white/20 transition-colors"
    >
      {showToolbar && <RichTextToolbar editor={editor} onImageUpload={onImageUpload} />}
      <EditorContent
        editor={editor}
        style={{ minHeight, maxHeight, overflowY: 'auto' }}
        className="px-3 py-2 text-sm text-white/90 prose prose-invert prose-sm max-w-none focus:outline-none"
      />
    </div>
  );
}
```

---

### MentionList.tsx (with @mention extension)

```typescript
'use client';

import { ReactRenderer } from '@tiptap/react';
import Mention from '@tiptap/extension-mention';
import tippy from 'tippy.js';  // Tiptap mentions use tippy.js — check if installed, if not use Radix Popover approach
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

// User suggestion item
interface MentionUser {
  id: string;
  label: string;  // display name
  avatar?: string;
}

// The dropdown component shown when user types @
interface MentionListProps {
  items: MentionUser[];
  command: (item: MentionUser) => void;
}

// NOTE: If tippy.js is NOT available, use a Radix Popover instead.
// Check package.json before deciding. Tiptap docs recommend tippy.js for mentions.
// Install: npm install tippy.js if not present

const MentionListComponent = forwardRef<any, MentionListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) command(item);
  };

  useEffect(() => setSelectedIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f1117] shadow-2xl py-1 min-w-[180px]">
      {items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => selectItem(index)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
            index === selectedIndex ? 'bg-white/[0.06] text-white' : 'text-white/70 hover:bg-white/[0.04]'
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-blue-500/30 flex items-center justify-center text-xs text-blue-300 flex-shrink-0">
            {item.label[0]?.toUpperCase()}
          </div>
          {item.label}
        </button>
      ))}
    </div>
  );
});
MentionListComponent.displayName = 'MentionList';

export function buildMentionExtension({ searchUrl, orgId }: { searchUrl: string; orgId: string }) {
  return Mention.configure({
    HTMLAttributes: { class: 'mention' },
    suggestion: {
      items: async ({ query }: { query: string }) => {
        if (!query || query.length < 1) return [];
        try {
          const res = await fetch(`${searchUrl}?q=${encodeURIComponent(query)}&orgId=${orgId}`);
          if (!res.ok) return [];
          const users: Array<{ id: string; name: string }> = await res.json();
          return users.map((u) => ({ id: u.id, label: u.name }));
        } catch {
          return [];
        }
      },
      render: () => {
        let component: ReactRenderer;
        let popup: any;

        return {
          onStart: (props: any) => {
            component = new ReactRenderer(MentionListComponent, {
              props,
              editor: props.editor,
            });

            popup = tippy('body', {
              getReferenceClientRect: props.clientRect,
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: 'manual',
              placement: 'bottom-start',
            });
          },
          onUpdate: (props: any) => {
            component.updateProps(props);
            popup[0].setProps({ getReferenceClientRect: props.clientRect });
          },
          onKeyDown: (props: any) => {
            if (props.event.key === 'Escape') {
              popup[0].hide();
              return true;
            }
            return (component.ref as any)?.onKeyDown(props);
          },
          onExit: () => {
            popup[0].destroy();
            component.destroy();
          },
        };
      },
    },
  });
}
```

---

### RichTextToolbar.tsx

```typescript
'use client';

import { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, Link2, Image as ImageIcon, Heading2
} from 'lucide-react';
import { useRef } from 'react';

interface RichTextToolbarProps {
  editor: Editor;
  onImageUpload?: (file: File) => Promise<string>;
}

export function RichTextToolbar({ editor, onImageUpload }: RichTextToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;

    onImageUpload(file).then((url) => {
      editor.chain().focus().setImage({ src: url }).run();
    });

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const toolbarButton = (
    onClick: () => void,
    icon: React.ReactNode,
    isActive: boolean,
    title: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${
        isActive
          ? 'bg-white/10 text-white'
          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/[0.07] flex-wrap">
      {toolbarButton(() => editor.chain().focus().toggleBold().run(), <Bold className="w-3.5 h-3.5" />, editor.isActive('bold'), 'Bold')}
      {toolbarButton(() => editor.chain().focus().toggleItalic().run(), <Italic className="w-3.5 h-3.5" />, editor.isActive('italic'), 'Italic')}
      {toolbarButton(() => editor.chain().focus().toggleUnderline().run(), <Underline className="w-3.5 h-3.5" />, editor.isActive('underline'), 'Underline')}
      {toolbarButton(() => editor.chain().focus().toggleStrike().run(), <Strikethrough className="w-3.5 h-3.5" />, editor.isActive('strike'), 'Strikethrough')}

      <div className="w-px h-4 bg-white/10 mx-1" />

      {toolbarButton(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className="w-3.5 h-3.5" />, editor.isActive('heading', { level: 2 }), 'Heading')}
      {toolbarButton(() => editor.chain().focus().toggleBulletList().run(), <List className="w-3.5 h-3.5" />, editor.isActive('bulletList'), 'Bullet List')}
      {toolbarButton(() => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="w-3.5 h-3.5" />, editor.isActive('orderedList'), 'Ordered List')}

      {onImageUpload && (
        <>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            type="button"
            title="Upload Image"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageFileSelect}
          />
        </>
      )}
    </div>
  );
}
```

### RichTextDisplay.tsx (read-only)

```typescript
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import './rich-text-editor.css';

interface RichTextDisplayProps {
  content: object | string | null;
}

export function RichTextDisplay({ content }: RichTextDisplayProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ HTMLAttributes: { class: 'max-w-full rounded-lg' } }),
      Link.configure({ openOnClick: true }),
      Mention.configure({ HTMLAttributes: { class: 'mention' } }),
    ],
    content: content ?? undefined,
    editable: false,
  });

  if (!editor) return null;
  return (
    <EditorContent
      editor={editor}
      className="prose prose-invert prose-sm max-w-none text-white/80"
    />
  );
}
```

### rich-text-editor.css

```css
/* Tiptap editor styling */
.ProseMirror {
  outline: none;
}

.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: rgba(255, 255, 255, 0.25);
  pointer-events: none;
  height: 0;
}

/* @mention styling */
.mention {
  background-color: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border-radius: 4px;
  padding: 0 4px;
  font-weight: 500;
}

/* Image in editor */
.ProseMirror img {
  max-width: 100%;
  border-radius: 8px;
  margin: 8px 0;
}

.ProseMirror img.ProseMirror-selectednode {
  outline: 2px solid #3b82f6;
}
```

---

## Acceptance Criteria

- [ ] `RichTextEditor` renders with toolbar and editable area
- [ ] Bold, italic, underline, strikethrough, heading, bullet list, ordered list all work
- [ ] Ctrl+V with an image in clipboard → uploads via `onImageUpload` → inserts image into editor
- [ ] Dragging an image file onto editor → uploads → inserts image
- [ ] Toolbar image button → file picker → uploads → inserts image
- [ ] `allowBase64: false` — images are never stored as base64 in content
- [ ] `@mention` shows dropdown when user types `@` (if `supportMentions: true`)
- [ ] Mention dropdown items fetched from `mentionSearchUrl?q=&orgId=`
- [ ] Selecting mention inserts `{ type: 'mention', attrs: { id, label } }` node
- [ ] Inserted mentions shown with blue highlight style (`.mention` class)
- [ ] `onChange` called with both JSON (for storage) and plain text (for search)
- [ ] `RichTextDisplay` renders content read-only with same styling
- [ ] `disabled` prop makes editor non-editable
- [ ] `minHeight` and `maxHeight` respected (scrolls when content exceeds maxHeight)

## Failure Criteria (reject if any)

- `allowBase64: true` used (base64 images bloat database)
- Clipboard paste not handled (just opens image in new tab instead of uploading)
- Mention dropdown doesn't show on `@` trigger
- `onChange` only returns JSON but not plain text (needed for search/preview)
- Editor styles break dark theme
- `RichTextDisplay` using different extensions than `RichTextEditor` (content renders differently)

## Testing

```
Manual test checklist:
1. Type in editor — text appears
2. Select text → click Bold → text becomes bold
3. Copy any image to clipboard (e.g., screenshot) → Ctrl+V in editor → image uploads and appears
4. Drag image file from desktop onto editor → uploads and appears
5. Type @ → dropdown appears with users → click user → @mention inserted with blue highlight
6. Save content (JSON) → render with RichTextDisplay → should look identical
7. Test disabled={true} → editor not editable
8. Resize window → editor stays within bounds (maxHeight scroll works)
```
