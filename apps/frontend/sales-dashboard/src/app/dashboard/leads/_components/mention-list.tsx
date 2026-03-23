'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface MentionItem {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) command({ id: item.id, label: item.name });
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="min-w-[180px] rounded-xl border border-white/10 bg-[#0f0f1a] px-3 py-2 text-xs text-muted-foreground shadow-xl">
        No members found
      </div>
    );
  }

  return (
    <div className="min-w-[200px] rounded-xl border border-white/10 bg-[#0f0f1a] py-1 shadow-xl">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            'flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-white/5',
            index === selectedIndex && 'bg-white/5',
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            command({ id: item.id, label: item.name });
          }}
        >
          <Avatar className="h-6 w-6 border border-white/10">
            <AvatarImage src={item.avatarUrl} alt={item.name} />
            <AvatarFallback className="text-[10px]">
              {item.name[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{item.name}</span>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';
export default MentionList;
