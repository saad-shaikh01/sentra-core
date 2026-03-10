'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PmThread, type PmThreadMessage } from '@/lib/api';
import { Send, MessageSquare, WifiOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useMembers } from '@/hooks/use-organization';
import { useThreadSocket, type ThreadMessage } from '@/hooks/use-thread-socket';

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
  const [wsMessages, setWsMessages] = useState<ThreadMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const memberMap = Object.fromEntries((members ?? []).map((m) => [m.id, m.name]));

  // 1. Fetch thread by scope (one-time, no polling)
  const { data: threadRes, isLoading: loadingThread } = useQuery({
    queryKey: ['thread', 'scope', scopeType, scopeId],
    queryFn: () => api.getThreadByScope(scopeType, scopeId),
    enabled: !!scopeId,
    retry: false,
    staleTime: Infinity,
  });

  const thread: PmThread | undefined = threadRes?.data;
  const threadId = thread?.id;

  // 2. Initial message history fetch (REST, no polling — WS delivers live updates)
  const { data: messagesData, isLoading: loadingMessages } = useQuery({
    queryKey: ['thread', threadId, 'messages'],
    queryFn: () => api.getThreadMessages(threadId!),
    enabled: !!threadId,
    staleTime: Infinity,
  });

  // Reset WS messages when thread changes
  useEffect(() => {
    setWsMessages([]);
  }, [threadId]);

  // 3. WebSocket for real-time messages
  const handleIncomingMessage = useCallback((msg: ThreadMessage) => {
    setWsMessages((prev) => {
      // Deduplicate by id
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const { status: wsStatus, sendMessage: wsSend } = useThreadSocket({
    threadId,
    enabled: !!threadId,
    onMessage: handleIncomingMessage,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.data, wsMessages]);

  // 4. Create thread mutation (lazy — only when there is no thread yet)
  const createThread = useMutation({
    mutationFn: () =>
      api
        .createThread({ projectId, scopeType, scopeId, visibility: 'INTERNAL' })
        .then((res) => res.data),
  });

  // 5. Send message — prefer WebSocket, fallback to HTTP if WS not connected
  const sendMessageHttp = useMutation({
    mutationFn: async (content: string) => {
      let targetThreadId = thread?.id;

      // Lazy create thread if it doesn't exist
      if (!targetThreadId) {
        const newThread = await createThread.mutateAsync();
        targetThreadId = newThread.id;
        queryClient.setQueryData(['thread', 'scope', scopeType, scopeId], { data: newThread });
      }

      return api.createThreadMessage(targetThreadId, { body: content });
    },
    onSuccess: (res) => {
      // Add to local state (WS will also broadcast but deduplicate)
      if (res?.data) {
        handleIncomingMessage(res.data);
      }
      setNewMessage('');
    },
    onError: (e: Error) => toast.error('Failed to send message', e.message),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => api.deleteThreadMessage(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', thread?.id, 'messages'] });
      toast.success('Message deleted');
    },
    onError: (e: Error) => toast.error('Failed to delete message', e.message),
  });

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = newMessage.trim();
    if (!content || sendMessageHttp.isPending || createThread.isPending) return;

    // Try WebSocket first; if not connected, fall back to HTTP
    const sentViaWs = thread?.id ? wsSend(content) : false;
    if (sentViaWs) {
      setNewMessage('');
    } else {
      sendMessageHttp.mutate(content);
    }
  };

  // Combine historical and live messages, deduplicating by id
  const historicalMessages: (PmThreadMessage | ThreadMessage)[] = messagesData?.data ?? [];
  const allIds = new Set(historicalMessages.map((m) => m.id));
  const liveOnly = wsMessages.filter((m) => !allIds.has(m.id));
  const messages = [...historicalMessages, ...liveOnly];

  const isDisconnected = thread?.id && wsStatus === 'disconnected';

  return (
    <div className={cn('flex flex-col h-[500px] border border-white/10 rounded-2xl bg-black/20 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">Discussion</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Internal Only</p>
          </div>
        </div>
        {isDisconnected && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full">
            <WifiOff className="h-3 w-3" />
            Reconnecting…
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingThread || loadingMessages ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn('flex gap-3', i % 2 === 0 ? 'justify-end' : '')}>
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
          messages.map((msg) => {
            const isMe = msg.authorId === user?.id;
            return (
              <div key={msg.id} className={cn('flex flex-col gap-1 max-w-[85%]', isMe ? 'ml-auto items-end' : 'mr-auto')}>
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {isMe ? 'You' : (memberMap[msg.authorId] ?? 'Unknown User')}
                  </span>
                  <span className="text-[9px] text-muted-foreground/50">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  className={cn(
                    'p-3 rounded-2xl text-sm leading-relaxed',
                    isMe
                      ? 'bg-primary/20 text-primary-foreground border border-primary/20 rounded-tr-sm'
                      : 'bg-white/5 text-foreground border border-white/10 rounded-tl-sm',
                  )}
                >
                  {msg.body}
                </div>
                {isMe && msg.messageType !== 'SYSTEM' && (
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1"
                    onClick={() => deleteMessageMutation.mutate(msg.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                )}
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
            disabled={sendMessageHttp.isPending || createThread.isPending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMessage.trim() || sendMessageHttp.isPending || createThread.isPending}
            className="h-10 w-10 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
