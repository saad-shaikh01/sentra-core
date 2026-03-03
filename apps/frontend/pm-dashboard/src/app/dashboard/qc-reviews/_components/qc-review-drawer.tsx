'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useSubmissionDetail, useSubmitReview } from '@/hooks/use-qc-reviews';
import { toast } from '@/hooks/use-toast';

interface QcReviewDrawerProps {
  submissionId: string | null;
  onClose: () => void;
}

export function QcReviewDrawer({ submissionId, onClose }: QcReviewDrawerProps) {
  const { data: submissionRes, isLoading } = useSubmissionDetail(submissionId!);
  const submission = submissionRes?.data;
  const submitReview = useSubmitReview();
  const [feedback, setFeedback] = useState('');

  const handleDecision = (decision: 'APPROVED' | 'REJECTED') => {
    submitReview.mutate(
      { submissionId: submissionId!, decision, feedback: feedback || undefined },
      { onSuccess: (data: any) => { 
        setFeedback(''); 
        toast.success(decision === 'APPROVED' ? 'Approved' : 'Rejected');
        onClose(); 
      } }
    );
  };

  return (
    <Dialog open={!!submissionId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full sm:max-w-xl p-0 border-l border-white/10 bg-black/40 backdrop-blur-2xl">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <div className="h-8 w-1/2 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-1/3 bg-white/5 rounded animate-pulse" />
          </div>
        ) : submission ? (
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-white/5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">{submission.task.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {submission.task.project?.name} &bull; {submission.task.projectStage?.name}
                  </p>
                </div>
                <StatusBadge status={submission.status} />
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Attempt #{submission.submissionNumber}
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Previous Reviews History */}
              {submission.qcReviews?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Review History</h3>
                  <div className="space-y-3">
                    {submission.qcReviews.map((rev: any) => (
                      <div key={rev.id} className="p-3 bg-white/5 border border-white/10 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-muted-foreground">Review #{rev.reviewNumber}</span>
                          <StatusBadge status={rev.decision} />
                        </div>
                        {rev.feedback && <p className="text-sm text-foreground/80 whitespace-pre-wrap">{rev.feedback}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Area */}
              {['SUBMITTED', 'UNDER_REVIEW'].includes(submission.status) && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">Your Review</h3>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Enter review feedback (required for rejection)..."
                    className="w-full min-h-[120px] p-3 rounded-xl bg-white/5 border border-white/10 focus:border-primary/50 outline-none text-sm resize-y"
                  />
                  <div className="flex gap-3">
                    <Button 
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      disabled={submitReview.isPending}
                      onClick={() => handleDecision('APPROVED')}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                    </Button>
                    <Button 
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                      disabled={submitReview.isPending || !feedback.trim()}
                      onClick={() => handleDecision('REJECTED')}
                    >
                      <XCircle className="h-4 w-4 mr-2" /> Reject
                    </Button>
                  </div>
                  {!feedback.trim() && (
                    <p className="text-xs text-red-400 text-center">Feedback is required to reject.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 text-muted-foreground">Submission not found.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
