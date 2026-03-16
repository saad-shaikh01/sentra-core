'use client';

import { use, useState, useEffect } from 'react';
import { portalApi } from '@/lib/portal-api';
import type { PortalDeliverable } from '@/lib/portal-api';

type Decision = 'APPROVED' | 'REJECTED';

export default function PortalDeliverablesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [deliverables, setDeliverables] = useState<PortalDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState<Record<string, Decision>>({});

  useEffect(() => {
    portalApi.getDeliverables(token)
      .then((res) => setDeliverables(res.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleRespond = async (approvalId: string, decision: Decision) => {
    try {
      await portalApi.respondToApproval(token, approvalId, decision, notes);
      setConfirmed((prev) => ({ ...prev, [approvalId]: decision }));
      setResponding(null);
      setNotes('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      alert(msg);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-32 bg-gray-50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <a href={`/portal/${token}`} className="text-blue-600 hover:underline text-sm">
          &larr; Back to Project
        </a>
        <span className="text-gray-300">|</span>
        <h1 className="text-xl font-bold text-gray-900">Deliverables</h1>
      </div>

      {deliverables.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-gray-500">No deliverables available yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {deliverables.map((pkg) => {
            const latestApproval = pkg.approvalRequests?.[0];
            const confirmedDecision = latestApproval ? confirmed[latestApproval.id] : null;
            const canRespond =
              latestApproval &&
              ['PENDING', 'SENT', 'VIEWED'].includes(latestApproval.status) &&
              !confirmedDecision;

            const displayStatus = confirmedDecision ?? latestApproval?.status;

            return (
              <div
                key={pkg.id}
                className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
                    {pkg.description && (
                      <p className="text-sm text-gray-500 mt-1">{pkg.description}</p>
                    )}
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full mt-2 inline-block">
                      {pkg.deliveryType}
                    </span>
                  </div>
                  {latestApproval && (
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        displayStatus === 'APPROVED'
                          ? 'bg-green-50 text-green-700'
                          : displayStatus === 'REJECTED'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {displayStatus}
                    </span>
                  )}
                </div>

                {pkg.items.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contents</p>
                    {pkg.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm text-gray-700 py-1">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0" />
                        {item.label || `Item ${item.sortOrder + 1}`}
                      </div>
                    ))}
                  </div>
                )}

                {canRespond && (
                  <div className="border-t border-gray-100 pt-4">
                    {responding === latestApproval.id ? (
                      <div className="space-y-3">
                        <textarea
                          className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Add notes (required for rejection)..."
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                        <div className="flex gap-3">
                          <button
                            onClick={() => void handleRespond(latestApproval.id, 'APPROVED')}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => void handleRespond(latestApproval.id, 'REJECTED')}
                            disabled={!notes.trim()}
                            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => {
                              setResponding(null);
                              setNotes('');
                            }}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setResponding(latestApproval.id)}
                        className="w-full border border-blue-200 text-blue-600 hover:bg-blue-50 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Review &amp; Respond
                      </button>
                    )}
                  </div>
                )}

                {confirmedDecision && (
                  <div
                    className={`rounded-lg p-3 text-center text-sm font-medium ${
                      confirmedDecision === 'APPROVED'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    Thank you! Your response ({confirmedDecision}) has been recorded.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
