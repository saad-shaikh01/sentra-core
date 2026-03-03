'use client';

import { useState, useMemo } from 'react';
import { useQueryStates, parseAsInteger } from 'nuqs';
import { PageHeader, Pagination } from '@/components/shared';
import { useQcQueue } from '@/hooks/use-qc-reviews';
import { QcQueueTable, SubmissionItem } from './_components/qc-queue-table';
import { QcReviewDrawer } from './_components/qc-review-drawer';

export default function QcReviewsPage() {
  const [params, setParams] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    limit: parseAsInteger.withDefault(20),
  });

  const queryParams = useMemo(() => ({
    page: params.page,
    limit: params.limit,
  }), [params.page, params.limit]);

  const { data, isLoading, isError } = useQcQueue(queryParams);
  const submissions = (data?.data ?? []) as SubmissionItem[];

  const [detailSubmissionId, setDetailSubmissionId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="QC Reviews"
        description="Quality control queue. Review submissions before they proceed to clients or final approval."
      />

      <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
        <QcQueueTable
          submissions={submissions}
          isLoading={isLoading}
          isError={isError}
          onRowClick={(s) => setDetailSubmissionId(s.id)}
        />
        
        <div className="p-4 border-t border-white/5">
          <Pagination
            page={params.page}
            total={data?.meta.total ?? 0}
            limit={params.limit}
            onChange={(p) => setParams({ page: p })}
          />
        </div>
      </div>

      <QcReviewDrawer
        submissionId={detailSubmissionId}
        onClose={() => setDetailSubmissionId(null)}
      />
    </div>
  );
}
