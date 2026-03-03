'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Send, User, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useMembers } from '@/hooks/use-organization';

interface ThreadPaneProps {
  projectId: string;
  scopeType: 'PROJECT' | 'STAGE' | 'TASK' | 'APPROVAL';
  scopeId: string;
  className?: string;
}

export function ThreadPane({ projectId, scopeType, scopeId, className }: ThreadPaneProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: members } = useMembers();
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const memberMap = Object.fromEntries((members ?? []).map((m: any) => [m.id, m.name]));

  // 1. Fetch thread by scope
  const { data: thread, isLoading: loadingThread } = useQuery({
    queryKey: ['thread', 'scope', scopeType, scopeId],
    queryFn: () => api.fetch<any>(`/pm/threads/scope/lookup?scopeType=${scopeType}&scopeId=${scopeId}`),
    enabled: !!scopeId,
    retry: false, // Don't retry if it returns 404 (we'll create it on first message)
  });

  // 2. Fetch messages if thread exists
  const { data: messagesData, isLoading: loadingMessages } = useQuery({
    queryKey: ['thread', thread?.id, 'messages'],
    queryFn: () => api.fetch<any>(`/pm/threads/${thread.id}/messages`),
    enabled: !!thread?.id,
    refetchInterval: 10000, // Poll every 10s for new messages
  });

  // Scroll to bottom when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.data]);

  // 3. Create thread mutation (lazy)
  const createThread = useMutation({
    mutationFn: () => api.fetch<any>('/pm/threads', {
      method: 'POST',
      body: JSON.stringify({ projectId, scopeType, scopeId, visibility: 'INTERNAL' })
    }),
  });

  // 4. Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      let targetThreadId = thread?.id;
      
      // Lazy create thread if it doesn't exist
      if (!targetThreadId) {
        const newThread = await createThread.mutateAsync();
        targetThreadId = newThread.id;
        queryClient.setQueryData(['thread', 'scope', scopeType, scopeId], newThread);
      }

      return api.fetch<any>(`/pm/threads/${targetThreadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: content })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', thread?.id, 'messages'] });
      setNewMessage('');
    },
    onError: (e: Error) => toast.error('Failed to send message', e.message),
  });

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || sendMessage.isPending) return;
    sendMessage.mutate(newMessage.trim());
  };

  const messages = messagesData?.data ?? [];

  return (
    <div className={cn("flex flex-col h-[500px] border border-white/10 rounded-2xl bg-black/20 overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-white/[0.02]">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <MessageSquare className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground tracking-tight">Discussion</h3>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Internal Only</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingThread || loadingMessages ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className={cn("flex gap-3", i % 2 === 0 ? "justify-end" : "")}>
                <div className="h-16 w-64 bg-white/5 rounded-2xl animate-pulse" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-3 opacity-20" />
            <p className="text-sm">No messages yet.</p>
            <p className="text-xs mt-1">Be the first to start the conversation.</p>
          </div>
        ) : (
          messages.map((msg: any) => {
            const isMe = msg.authorId === user?.id;
            return (
              <div key={msg.id} className={cn("flex flex-col gap-1 max-w-[85%]", isMe ? "ml-auto items-end" : "mr-auto")}>
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {isMe ? 'You' : (memberMap[msg.authorId] ?? 'Unknown User')}
                  </span>
                  <span className="text-[9px] text-muted-foreground/50">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className={cn(
                  "p-3 rounded-2xl text-sm leading-relaxed",
                  isMe 
                    ? "bg-primary/20 text-primary-foreground border border-primary/20 rounded-tr-sm" 
                    : "bg-white/5 text-foreground border border-white/10 rounded-tl-sm"
                )}>
                  {msg.body}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-white/5 bg-white/[0.01]">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-sm outline-none focus:border-primary/50 transition-colors"
            disabled={sendMessage.isPending || createThread.isPending}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!newMessage.trim() || sendMessage.isPending || createThread.isPending}
            className="h-10 w-10 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
