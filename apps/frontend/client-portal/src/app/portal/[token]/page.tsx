'use client';

import { use, useState, useEffect } from 'react';
import { portalApi } from '@/lib/portal-api';
import type { PortalProject } from '@/lib/portal-api';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING:   { bg: 'bg-gray-100',    text: 'text-gray-600'    },
  READY:     { bg: 'bg-blue-50',     text: 'text-blue-600'    },
  ACTIVE:    { bg: 'bg-green-50',    text: 'text-green-600'   },
  IN_REVIEW: { bg: 'bg-amber-50',    text: 'text-amber-600'   },
  BLOCKED:   { bg: 'bg-red-50',      text: 'text-red-600'     },
  COMPLETED: { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  SKIPPED:   { bg: 'bg-gray-50',     text: 'text-gray-400'    },
};

const HEALTH_COLORS: Record<string, string> = {
  ON_TRACK: 'text-green-600',
  AT_RISK:  'text-amber-600',
  OFF_TRACK: 'text-red-600',
  BLOCKED:  'text-red-700',
};

export default function PortalProjectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [projectData, setProjectData] = useState<{ project: PortalProject; clientEmail: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.getProject(token)
      .then((res) => setProjectData(res.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="space-y-3 mt-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Access Error</h2>
          <p className="text-red-600 text-sm">{error}</p>
          <p className="text-gray-500 text-xs mt-2">This link may have expired or been revoked.</p>
        </div>
      </div>
    );
  }

  if (!projectData) return null;

  const { project, clientEmail } = projectData;
  const completedStages = project.stages.filter((s) => s.status === 'COMPLETED').length;
  const totalStages = project.stages.length;
  const progress = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {project.engagement && (
              <p className="text-gray-500 text-sm mt-1">{project.engagement.name}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Welcome</p>
            <p className="text-sm font-medium text-gray-700">{clientEmail}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <span className="text-xs text-gray-500">Health:</span>
          <span className={`text-sm font-medium ${HEALTH_COLORS[project.healthStatus] || 'text-gray-600'}`}>
            {project.healthStatus.replace(/_/g, ' ')}
          </span>
          {project.deliveryDueAt && (
            <>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">
                Due: {new Date(project.deliveryDueAt).toLocaleDateString()}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Overall Progress</h2>
          <span className="text-sm font-bold text-gray-900">{progress}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {completedStages} of {totalStages} stages completed
        </p>
      </div>

      {/* Stage Timeline */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Production Stages</h2>
        <div className="space-y-3">
          {project.stages.map((stage, idx) => {
            const colors = STATUS_COLORS[stage.status] || { bg: 'bg-gray-50', text: 'text-gray-600' };
            return (
              <div key={stage.id} className="flex items-center gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500">
                  {idx + 1}
                </div>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm text-gray-800">{stage.name}</span>
                  <div className="flex items-center gap-3">
                    {stage.dueAt && (
                      <span className="text-xs text-gray-400">
                        {new Date(stage.dueAt).toLocaleDateString()}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text}`}>
                      {stage.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="grid grid-cols-2 gap-4">
        <a
          href={`/portal/${token}/deliverables`}
          className="bg-blue-600 hover:bg-blue-700 text-white text-center py-3 rounded-xl font-medium text-sm transition-colors"
        >
          View Deliverables
        </a>
        <a
          href={`/portal/${token}/messages`}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-center py-3 rounded-xl font-medium text-sm transition-colors"
        >
          Messages
        </a>
      </div>
    </div>
  );
}
