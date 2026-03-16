const PM_API_URL = process.env.NEXT_PUBLIC_PM_API_URL || 'http://localhost:3003/api/pm';

async function portalFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${PM_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error?.message || `HTTP ${response.status}`);
  }

  if (response.status === 204) return {} as T;
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export interface PortalProject {
  id: string;
  name: string;
  status: string;
  serviceType: string;
  deliveryDueAt: string | null;
  healthStatus: string;
  stages: Array<{
    id: string;
    name: string;
    status: string;
    sortOrder: number;
    dueAt: string | null;
    departmentCode: string;
  }>;
  engagement?: { name: string };
}

export interface PortalDeliverable {
  id: string;
  name: string;
  description: string | null;
  deliveryType: string;
  items: Array<{ id: string; label: string | null; sortOrder: number }>;
  approvalRequests: Array<{ id: string; status: string; sentAt: string | null }>;
}

export interface PortalThread {
  id: string;
  scopeType: string;
  messages: Array<{ id: string; body: string; authorId: string; createdAt: string }>;
  _count: { messages: number };
}

export const portalApi = {
  getProject: (token: string) =>
    portalFetch<{ data: { project: PortalProject; clientEmail: string } }>(`/client-portal/projects/${token}`),

  getDeliverables: (token: string) =>
    portalFetch<{ data: PortalDeliverable[] }>(`/client-portal/projects/${token}/deliverables`),

  getThreads: (token: string) =>
    portalFetch<{ data: PortalThread[] }>(`/client-portal/threads/${token}`),

  postMessage: (token: string, threadId: string, message: string) =>
    portalFetch<{ data: unknown }>(`/client-portal/threads/${token}/messages`, {
      method: 'POST',
      body: JSON.stringify({ threadId, message }),
    }),

  respondToApproval: (token: string, approvalId: string, decision: 'APPROVED' | 'REJECTED', notes?: string) =>
    portalFetch<{ data: unknown }>(`/client-portal/approvals/${approvalId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ token, decision, notes }),
    }),
};
