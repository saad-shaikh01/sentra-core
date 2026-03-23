'use client';

import { useCallback, useEffect, useRef } from 'react';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { AtSign, Bold, Italic, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import MentionList, { type MentionListRef, type MentionItem } from './mention-list';

interface LeadNoteEditorProps {
  members: MentionItem[];
  initialContent?: string;
  onSubmit: (content: string, mentionedUserIds: string[]) => Promise<void>;
  onCancel?: () => void;
  isPending?: boolean;
  submitLabel?: string;
  placeholder?: string;
}

function extractMentionIds(json: Record<string, unknown>): string[] {
  const ids: string[] = [];
  function walk(node: Record<string, unknown>) {
    if (node['type'] === 'mention') {
      const attrs = node['attrs'] as Record<string, unknown> | undefined;
      const id = attrs?.['id'];
      if (id) ids.push(String(id));
    }
    const content = node['content'] as Record<string, unknown>[] | undefined;
    if (Array.isArray(content)) content.forEach(walk);
  }
  walk(json);
  return [...new Set(ids)];
}

export function LeadNoteEditor({
  members,
  initialContent,
  onSubmit,
  onCancel,
  isPending,
  submitLabel = 'Add Note',
  placeholder = 'Write a note… type @ to mention someone',
}: LeadNoteEditorProps) {
  const membersRef = useRef<MentionItem[]>(members);
  const submitFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          char: '@',
          items: ({ query }: { query: string }) =>
            membersRef.current
              .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 6),
          render: () => {
            let component: ReactRenderer<MentionListRef> | null = null;

            function positionEl(el: HTMLElement, clientRectFn: (() => DOMRect | null) | undefined) {
              const rect = clientRectFn?.();
              if (!rect) return;
              el.style.position = 'fixed';
              el.style.top = `${rect.bottom + 6}px`;
              el.style.left = `${rect.left}px`;
              el.style.zIndex = '9999';
            }

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });
                document.body.appendChild(component.element);
                positionEl(component.element as HTMLElement, props.clientRect);
              },
              onUpdate: (props: any) => {
                component?.updateProps(props);
                positionEl(component?.element as HTMLElement, props.clientRect);
              },
              onKeyDown: (props: any) => {
                if (props.event?.key === 'Escape') {
                  (component?.element as HTMLElement | undefined)?.remove();
                  component?.destroy();
                  component = null;
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                (component?.element as HTMLElement | undefined)?.remove();
                component?.destroy();
                component = null;
              },
            };
          },
        },
      }),
    ],
    content: initialContent ?? '',
    editorProps: {
      attributes: { class: 'text-sm outline-none min-h-[80px] leading-6' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          submitFnRef.current?.();
          return true;
        }
        return false;
      },
    },
  });

  const handleSubmit = useCallback(async () => {
    if (!editor || editor.isEmpty || isPending) return;
    const html = editor.getHTML();
    const json = editor.getJSON() as Record<string, unknown>;
    const mentionedUserIds = extractMentionIds(json);
    await onSubmit(html, mentionedUserIds);
    editor.commands.clearContent();
  }, [editor, isPending, onSubmit]);

  useEffect(() => {
    submitFnRef.current = handleSubmit;
  }, [handleSubmit]);

  const isEmpty = !editor || editor.isEmpty;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-white/[0.07] px-3 py-1.5">
        <button
          type="button"
          title="Bold (Ctrl+B)"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBold().run();
          }}
          className={cn(
            'rounded p-1 text-muted-foreground transition hover:bg-white/10 hover:text-foreground',
            editor?.isActive('bold') && 'bg-white/10 text-foreground',
          )}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Italic (Ctrl+I)"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleItalic().run();
          }}
          className={cn(
            'rounded p-1 text-muted-foreground transition hover:bg-white/10 hover:text-foreground',
            editor?.isActive('italic') && 'bg-white/10 text-foreground',
          )}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <AtSign className="h-3 w-3" />
          <span>mention · Ctrl+Enter to submit</span>
        </div>
      </div>

      {/* Editor area */}
      <div className="relative px-3 py-2">
        {isEmpty && (
          <p className="pointer-events-none absolute left-3 top-2 select-none text-sm text-muted-foreground">
            {placeholder}
          </p>
        )}
        <div className="[&_.mention]:cursor-default [&_.mention]:font-semibold [&_.mention]:text-primary">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-3 py-2">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" onClick={handleSubmit} disabled={isEmpty || isPending}>
          {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
