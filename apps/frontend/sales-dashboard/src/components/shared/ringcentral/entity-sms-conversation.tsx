'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  MessageSquare,
  RefreshCw,
  SendHorizontal,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useMarkRingCentralSmsThreadRead,
  useRingCentralSmsMessages,
  useRingCentralSmsThreads,
  useSendRingCentralSms,
} from '@/hooks/use-comm';
import { timeAgo } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import type {
  RingCentralSmsMessage,
  RingCentralSmsThread,
} from '@/types/comm.types';

type EntitySmsConversationProps = {
  entityType: 'lead' | 'client';
  entityId: string;
  phoneNumber?: string | null;
  contactName?: string;
  brandId?: string;
};

export function EntitySmsConversation({
  entityType,
  entityId,
  phoneNumber,
  contactName,
  brandId,
}: EntitySmsConversationProps) {
  const {
    data: threads,
    isLoading: isLoadingThreads,
    isError: isThreadsError,
    refetch: refetchThreads,
  } = useRingCentralSmsThreads(
    { entityType, entityId, limit: 20 },
    { enabled: !!entityId },
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const sendSms = useSendRingCentralSms();
  const markThreadRead = useMarkRingCentralSmsThreadRead();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!threads?.length) {
      setSelectedThreadId(undefined);
      return;
    }

    if (!selectedThreadId || !threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0]?.id);
    }
  }, [selectedThreadId, threads]);

  const selectedThread = threads?.find((thread) => thread.id === selectedThreadId);
  const {
    data: messages,
    isLoading: isLoadingMessages,
    isError: isMessagesError,
    refetch: refetchMessages,
  } = useRingCentralSmsMessages(
    selectedThread
      ? { threadId: selectedThread.id, entityType, entityId, limit: 50 }
      : { entityType, entityId, limit: 50 },
    { enabled: !!entityId },
  );

  useEffect(() => {
    if (selectedThread?.id && selectedThread.unreadCount > 0 && !markThreadRead.isPending) {
      markThreadRead.mutate(selectedThread.id);
    }
  }, [markThreadRead, selectedThread?.id, selectedThread?.unreadCount]);

  const recipientPhoneNumber = selectedThread?.participantPhoneNumber ?? phoneNumber ?? undefined;

  const handleSend = async () => {
    const text = draft.trim();
    if (!recipientPhoneNumber || !text) {
      return;
    }

    const message = await sendSms.mutateAsync({
      toPhoneNumber: recipientPhoneNumber,
      text,
      connectionId: selectedThread?.connectionId,
      fromPhoneNumber: selectedThread?.fromPhoneNumber,
      brandId: selectedThread?.brandId ?? brandId,
      contactName: selectedThread?.contactName ?? contactName,
      entityType,
      entityId,
    });

    setDraft('');
    if (message.threadId) {
      setSelectedThreadId(message.threadId);
    }
  };

  if (isLoadingThreads) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((index) => (
          <div key={index} className="h-20 rounded-xl border border-white/10 bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  if (isThreadsError) {
    return (
      <div className="space-y-3 py-10 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-400/60" />
        <p className="text-sm text-muted-foreground">Failed to load SMS history.</p>
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => void refetchThreads()}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">SMS Conversations</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Inbound texts sync from RingCentral webhooks. Replies send from the selected extension.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => {
            void refetchThreads();
            void refetchMessages();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {threads && threads.length > 0 ? (
        <div className="space-y-2">
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              isActive={thread.id === selectedThreadId}
              onSelect={() => setSelectedThreadId(thread.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <MessageSquare className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No SMS history yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Messages to this record will appear here once the first text is sent or received.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            {selectedThread?.contactName ?? selectedThread?.participantName ?? contactName ?? 'SMS thread'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {recipientPhoneNumber ?? 'No phone number available'}
          </p>
        </div>

        <div className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-4">
          {isLoadingMessages ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-16 rounded-xl border border-white/10 bg-white/[0.03]" />
              ))}
            </div>
          ) : isMessagesError ? (
            <div className="space-y-3 py-10 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-red-400/60" />
              <p className="text-sm text-muted-foreground">Failed to load SMS messages.</p>
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => void refetchMessages()}>
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : messages && messages.length > 0 ? (
            messages.map((message) => <SmsBubble key={message.id} message={message} />)
          ) : (
            <div className="py-10 text-center">
              <Smartphone className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">No messages in this thread</p>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-white/10 px-4 py-4">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              recipientPhoneNumber
                ? `Write an SMS to ${selectedThread?.contactName ?? contactName ?? recipientPhoneNumber}`
                : 'Add a phone number to this record before sending SMS'
            }
            rows={4}
            disabled={!recipientPhoneNumber || sendSms.isPending}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              {selectedThread?.connectionLabel ?? 'RingCentral'}{selectedThread?.fromPhoneNumber ? ` • ${selectedThread.fromPhoneNumber}` : ''}
            </p>
            <Button
              type="button"
              className="gap-2"
              onClick={() => void handleSend()}
              disabled={!recipientPhoneNumber || !draft.trim() || sendSms.isPending}
            >
              <SendHorizontal className="h-3.5 w-3.5" />
              {sendSms.isPending ? 'Sending...' : 'Send SMS'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  isActive,
  onSelect,
}: {
  thread: RingCentralSmsThread;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-3 text-left transition-all',
        isActive
          ? 'border-sky-500/30 bg-sky-500/[0.08]'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {thread.contactName ?? thread.participantName ?? thread.participantPhoneNumber}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {thread.participantPhoneNumber}
          </p>
          {thread.snippet ? (
            <p className="mt-1 truncate text-xs text-muted-foreground/80">
              {thread.snippet}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">
            {thread.lastMessageAt ? timeAgo(thread.lastMessageAt) : ''}
          </p>
          {thread.unreadCount > 0 ? (
            <span className="mt-2 inline-flex rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
              {thread.unreadCount} new
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function SmsBubble({ message }: { message: RingCentralSmsMessage }) {
  const isOutbound = message.direction === 'Outbound';

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl border px-4 py-3',
          isOutbound
            ? 'border-sky-500/30 bg-sky-500/[0.10]'
            : 'border-white/10 bg-white/[0.04]',
        )}
      >
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {message.subject ?? ''}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
          <span>{isOutbound ? 'Sent' : 'Received'}</span>
          <span>{message.sentAt ? timeAgo(message.sentAt) : ''}</span>
        </div>
      </div>
    </div>
  );
}
