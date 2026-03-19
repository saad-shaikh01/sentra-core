'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import Mention from '@tiptap/extension-mention';
import type { Editor } from '@tiptap/react';
import type { Instance, Props as TippyProps } from 'tippy.js';
import tippy from 'tippy.js';
import { createRoot } from 'react-dom/client';

// -------------------------------------------------------
// Suggestion item shape
// -------------------------------------------------------
export interface MentionItem {
  id: string;
  label: string;
  avatarUrl?: string;
}

// -------------------------------------------------------
// MentionList component (rendered inside Tippy popover)
// -------------------------------------------------------
export interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  function MentionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }: SuggestionKeyDownProps) {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="mention-list">
          <div className="mention-list-empty">No results</div>
        </div>
      );
    }

    return (
      <div className="mention-list">
        {items.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={`mention-list-item${index === selectedIndex ? ' is-selected' : ''}`}
            onClick={() => selectItem(index)}
          >
            {item.avatarUrl ? (
              <img src={item.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/60">
                {item.label.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    );
  },
);

// -------------------------------------------------------
// buildMentionExtension factory
// -------------------------------------------------------
interface BuildMentionOptions {
  /**
   * Called when user types @ — return matching items.
   * Can be async.
   */
  fetchSuggestions: (query: string) => MentionItem[] | Promise<MentionItem[]>;
}

export function buildMentionExtension({ fetchSuggestions }: BuildMentionOptions) {
  return Mention.configure({
    HTMLAttributes: { class: 'mention' },
    suggestion: {
      items: async ({ query }: { query: string }) => {
        return fetchSuggestions(query);
      },

      render() {
        let component: React.RefObject<MentionListHandle | null> | null = null;
        let popup: Instance<TippyProps>[] | null = null;
        let container: HTMLDivElement | null = null;
        let root: ReturnType<typeof createRoot> | null = null;

        return {
          onStart(props: SuggestionProps) {
            component = React.createRef<MentionListHandle>();
            container = document.createElement('div');
            root = createRoot(container);

            root.render(
              <MentionList
                ref={component}
                items={props.items as MentionItem[]}
                command={props.command as (item: MentionItem) => void}
              />,
            );

            popup = tippy('body', {
              getReferenceClientRect: props.clientRect as () => DOMRect,
              appendTo: () => document.body,
              content: container,
              showOnCreate: true,
              interactive: true,
              trigger: 'manual',
              placement: 'bottom-start',
              theme: 'none',
            });
          },

          onUpdate(props: SuggestionProps) {
            root?.render(
              <MentionList
                ref={component}
                items={props.items as MentionItem[]}
                command={props.command as (item: MentionItem) => void}
              />,
            );
            popup?.[0]?.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          },

          onKeyDown(props: SuggestionKeyDownProps) {
            if (props.event.key === 'Escape') {
              popup?.[0]?.hide();
              return true;
            }
            return component?.current?.onKeyDown(props) ?? false;
          },

          onExit() {
            popup?.[0]?.destroy();
            if (root) {
              setTimeout(() => root?.unmount(), 0);
            }
          },
        };
      },

      // Render a mention node as @label
      char: '@',
      allowSpaces: false,
    },
  });
}

// Re-export the base extension for direct use if needed
export { Mention as MentionExtension };

// Helper: build a simple inline suggestion fetch from a static list
export function buildStaticMentionFetch(
  items: MentionItem[],
): (query: string) => MentionItem[] {
  return (query: string) => {
    const q = query.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 8);
  };
}

// Render the editor inside a Tippy popup
// (the editor instance is passed so external buttons can focus it)
export function focusEditor(editor: Editor | null) {
  editor?.chain().focus().run();
}
