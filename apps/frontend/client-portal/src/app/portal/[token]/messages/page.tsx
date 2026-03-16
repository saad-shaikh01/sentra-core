'use client';

import { use, useState, useEffect, useRef } from 'react';
import { portalApi } from '@/lib/portal-api';
import type { PortalThread } from '@/lib/portal-api';

export default function PortalMessagesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [threads, setThreads] = useState<PortalThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    portalApi.getThreads(token)
      .then((res) => {
        setThreads(res.data);
        if (res.data.length > 0) setActiveThread(res.data[0].id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const activeThreadData = threads.find((t) => t.id === activeThread);

  const handleSend = async () => {
    if (!newMessage.trim() || !activeThread) return;
    setSending(true);
    try {
      const res = await portalApi.postMessage(token, activeThread, newMessage.trim());
      const newMsg = {
        id: (res as { data?: { id?: string } }).data?.id ?? String(Date.now()),
        body: newMessage.trim(),
        authorId: 'client',
        createdAt: new Date().toISOString(),
      };
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== activeThread) return t;
          return {
            ...t,
            messages: [...t.messages, newMsg],
            _count: { messages: t._count.messages + 1 },
          };
        })
      );
      setNewMessage('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      alert(msg);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="h-96 bg-gray-50 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <a href={`/portal/${token}`} className="text-blue-600 hover:underline text-sm">
          &larr; Back to Project
        </a>
        <span className="text-gray-300">|</span>
        <h1 className="text-xl font-bold text-gray-900">Messages</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          {error}
        </div>
      )}

      {threads.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-gray-500">No message threads available.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          {/* Thread tabs — only shown when multiple threads exist */}
          {threads.length > 1 && (
            <div className="border-b border-gray-100">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveThread(t.id)}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors ${
                    activeThread === t.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700'
                  }`}
                >
                  {t.scopeType} Thread ({t._count.messages} messages)
                </button>
              ))}
            </div>
          )}

          {/* Message list */}
          <div className="h-80 overflow-y-auto p-4 space-y-3">
            {activeThreadData?.messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-400 text-sm">No messages yet. Start the conversation below.</p>
              </div>
            ) : (
              activeThreadData?.messages.map((msg) => {
                const isClient = msg.authorId === 'client' || msg.authorId.startsWith('client:');
                return (
                  <div key={msg.id} className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-xl px-4 py-2 text-sm ${
                        isClient ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <p>{msg.body}</p>
                      <p className={`text-xs mt-1 ${isClient ? 'text-blue-200' : 'text-gray-400'}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose area */}
          <div className="border-t border-gray-100 p-4 flex gap-3">
            <textarea
              className="flex-1 border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Type a message..."
              rows={2}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={!newMessage.trim() || sending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors self-end"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
