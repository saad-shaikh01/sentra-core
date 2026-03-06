const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const COMM_API_URL = process.env.NEXT_PUBLIC_COMM_API_URL || 'http://localhost:3002/api/comm';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
  service?: 'comm';
}

export type AppBundleInput = {
  appCode: 'SALES_DASHBOARD' | 'PM_DASHBOARD' | 'HRMS' | 'CLIENT_PORTAL' | 'COMM_SERVICE';
  roleIds?: string[];
  scopeGrants?: Array<{
    resourceKey: string;
    scopeType: 'OWN' | 'TEAM' | 'DEPARTMENT' | 'BRAND' | 'PROJECT' | 'ALL';
    scopeValues?: Record<string, unknown>;
  }>;
};

class ApiClient {
  private baseUrl: string;
  private commUrl: string;

  constructor(baseUrl: string, commUrl: string = COMM_API_URL) {
    this.baseUrl = baseUrl;
    this.commUrl = commUrl;
  }

  private getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refreshToken');
  }

  setTokens(accessToken: string, refreshToken: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  private async refreshAccessToken(): Promise<string | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshToken}`,
        },
      });

      if (!response.ok) {
        this.clearTokens();
        return null;
      }

      const data = await response.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      this.clearTokens();
      return null;
    }
  }

  async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { skipAuth = false, service, ...fetchOptions } = options;
    const baseUrl = service === 'comm' ? this.commUrl : this.baseUrl;
    const url = `${baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    };

    if (!skipAuth) {
      const accessToken = this.getAccessToken();
      if (accessToken) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
      }
    }

    let response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (response.status === 401 && !skipAuth) {
      const newAccessToken = await this.refreshAccessToken();
      if (newAccessToken) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${newAccessToken}`;
        response = await fetch(url, {
          ...fetchOptions,
          headers,
        });
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) return {} as T;
    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.fetch<{
      accessToken: string;
      refreshToken: string;
      user: any;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
  }

  async signup(data: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  }) {
    return this.fetch<{
      accessToken: string;
      refreshToken: string;
      user: any;
      organization: any;
    }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
    });
  }

  async logout() {
    try {
      await this.fetch('/auth/logout', { method: 'POST' });
    } finally {
      this.clearTokens();
    }
  }

  async getInvitation(token: string) {
    return this.fetch<{
      id: string;
      email: string;
      role?: string | null;
      organizationName: string;
      bundles?: Array<{
        appCode: string;
        roleIds?: string[];
        scopeGrants?: unknown[];
      }>;
    }>(`/auth/invite?token=${token}`, { skipAuth: true });
  }

  async acceptInvitation(data: { token: string; name: string; password: string }) {
    return this.fetch<{
      accessToken: string;
      refreshToken: string;
      user: any;
    }>('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
    });
  }

  async getAvailableApps() {
    return this.fetch<Array<{
      appCode: string;
      appName: string;
      baseUrl?: string;
      isDefault: boolean;
    }>>('/auth/apps');
  }

  // User endpoints
  async getMe() {
    return this.fetch<any>('/users/me');
  }

  async updateProfile(data: {
    name?: string;
    avatarUrl?: string;
    jobTitle?: string;
    phone?: string;
    bio?: string;
  }) {
    return this.fetch<any>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Organization endpoints
  async getMembers() {
    return this.fetch<any[]>('/organization/members');
  }

  async updateMemberRole(userId: string, role: string) {
    return this.fetch<any>(`/organization/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async removeMember(userId: string) {
    return this.fetch<{ message: string }>(`/organization/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // Invitation endpoints
  async sendInvitation(email: string, role: string) {
    return this.fetch<any>('/organization/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  async sendIamInvitation(dto: {
    email: string;
    appBundles: AppBundleInput[];
    expiresInDays?: number;
  }) {
    return this.fetch<any>('/iam/invitations', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async getPendingInvitations() {
    return this.fetch<any[]>('/organization/invitations');
  }

  async getIamInvitations() {
    return this.fetch<any[]>('/iam/invitations');
  }

  async cancelInvitation(invitationId: string) {
    return this.fetch<{ message: string }>(`/organization/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  }

  async resendIamInvitation(invitationId: string) {
    return this.fetch<any>(`/iam/invitations/${invitationId}/resend`, {
      method: 'POST',
    });
  }

  async cancelIamInvitation(invitationId: string) {
    return this.fetch<{ message: string }>(`/iam/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  }

  async updateUserEntitlements(
    userId: string,
    dto: { appBundles: AppBundleInput[]; defaultAppCode?: AppBundleInput['appCode'] },
  ) {
    return this.fetch<any>(`/iam/users/${userId}/entitlements`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  // Brand endpoints
  async getBrands(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/brands${qs}`);
  }

  async getBrand(id: string) {
    return this.fetch<any>(`/brands/${id}`);
  }

  async createBrand(dto: Record<string, unknown>) {
    return this.fetch<any>('/brands', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateBrand(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/brands/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteBrand(id: string) {
    return this.fetch<{ message: string }>(`/brands/${id}`, { method: 'DELETE' });
  }

  // Lead endpoints
  async getLeads(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/leads${qs}`);
  }

  async getLead(id: string) {
    return this.fetch<any>(`/leads/${id}`);
  }

  async createLead(dto: Record<string, unknown>) {
    return this.fetch<any>('/leads', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateLead(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteLead(id: string) {
    return this.fetch<{ message: string }>(`/leads/${id}`, { method: 'DELETE' });
  }

  async changeLeadStatus(id: string, status: string) {
    return this.fetch<any>(`/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  async assignLead(id: string, assignedToId: string) {
    return this.fetch<any>(`/leads/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ assignedToId }) });
  }

  async addLeadNote(id: string, content: string) {
    return this.fetch<any>(`/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ content }) });
  }

  async convertLead(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(dto) });
  }

  async getLeadActivities(id: string) {
    return this.fetch<any[]>(`/leads/${id}/activities`);
  }

  // Client endpoints
  async getClients(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/clients${qs}`);
  }

  async getClient(id: string) {
    return this.fetch<any>(`/clients/${id}`);
  }

  async createClient(dto: Record<string, unknown>) {
    return this.fetch<any>('/clients', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateClient(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteClient(id: string) {
    return this.fetch<{ message: string }>(`/clients/${id}`, { method: 'DELETE' });
  }

  // Sale endpoints
  async getSales(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/sales${qs}`);
  }

  async getSale(id: string) {
    return this.fetch<any>(`/sales/${id}`);
  }

  async createSale(dto: Record<string, unknown>) {
    return this.fetch<any>('/sales', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateSale(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/sales/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteSale(id: string) {
    return this.fetch<{ message: string }>(`/sales/${id}`, { method: 'DELETE' });
  }

  async chargeSale(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/sales/${id}/charge`, { method: 'POST', body: JSON.stringify(dto) });
  }

  async createSubscription(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/sales/${id}/subscribe`, { method: 'POST', body: JSON.stringify(dto) });
  }

  async cancelSubscription(id: string) {
    return this.fetch<any>(`/sales/${id}/subscription`, { method: 'DELETE' });
  }

  // Invoice endpoints
  async getInvoices(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/invoices${qs}`);
  }

  async getInvoice(id: string) {
    return this.fetch<any>(`/invoices/${id}`);
  }

  async createInvoice(dto: Record<string, unknown>) {
    return this.fetch<any>('/invoices', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateInvoice(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteInvoice(id: string) {
    return this.fetch<{ message: string }>(`/invoices/${id}`, { method: 'DELETE' });
  }

  async payInvoice(id: string) {
    return this.fetch<any>(`/invoices/${id}/pay`, { method: 'POST' });
  }

  async downloadInvoicePdf(id: string) {
    const url = `${this.baseUrl}/invoices/${id}/pdf`;
    const accessToken = this.getAccessToken();
    const response = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!response.ok) throw new Error('Failed to download PDF');
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `invoice-${id}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Comm — Identities
  async listIdentities() {
    return this.fetch<any>('/identities', { service: 'comm' });
  }

  async initiateOAuth(brandId?: string) {
    const qs = brandId ? `?brandId=${encodeURIComponent(brandId)}` : '';
    return this.fetch<{ redirectUrl: string }>(`/identities/oauth/initiate${qs}`, { service: 'comm' });
  }

  async disconnectIdentity(id: string) {
    return this.fetch<void>(`/identities/${id}`, { method: 'DELETE', service: 'comm' });
  }

  async setDefaultIdentity(id: string) {
    return this.fetch<void>(`/identities/${id}/default`, { method: 'PATCH', service: 'comm' });
  }

  // Comm — Threads
  async listCommThreads(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/threads${qs}`, { service: 'comm' });
  }

  async getCommThread(id: string) {
    return this.fetch<any>(`/threads/${id}`, { service: 'comm' });
  }

  async archiveCommThread(id: string) {
    return this.fetch<void>(`/threads/${id}/archive`, { method: 'PATCH', service: 'comm' });
  }

  async markCommThreadRead(id: string) {
    return this.fetch<void>(`/threads/${id}/read`, { method: 'PATCH', service: 'comm' });
  }

  // Comm — Messages
  async listCommMessages(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/messages${qs}`, { service: 'comm' });
  }

  async getCommMessage(id: string) {
    return this.fetch<any>(`/messages/${id}`, { service: 'comm' });
  }

  async sendCommMessage(dto: Record<string, unknown>, idempotencyKey: string) {
    return this.fetch<any>('/messages/send', {
      method: 'POST',
      body: JSON.stringify(dto),
      headers: { 'Idempotency-Key': idempotencyKey },
      service: 'comm',
    });
  }

  async replyToCommMessage(id: string, dto: Record<string, unknown>, idempotencyKey: string) {
    return this.fetch<any>(`/messages/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify(dto),
      headers: { 'Idempotency-Key': idempotencyKey },
      service: 'comm',
    });
  }

  async forwardCommMessage(id: string, dto: Record<string, unknown>, idempotencyKey: string) {
    return this.fetch<any>(`/messages/${id}/forward`, {
      method: 'POST',
      body: JSON.stringify(dto),
      headers: { 'Idempotency-Key': idempotencyKey },
      service: 'comm',
    });
  }

  // Comm — Timeline
  async getEntityTimeline(entityType: string, entityId: string, params?: Record<string, unknown>) {
    const allParams = { entityType, entityId, ...(params ?? {}) };
    const qs = '?' + new URLSearchParams(allParams as Record<string, string>).toString();
    return this.fetch<any>(`/threads${qs}`, { service: 'comm' });
  }

  // Comm — Entity Links
  async linkCommThread(threadId: string, entityType: string, entityId: string) {
    return this.fetch<void>(`/entity-links`, {
      method: 'POST',
      body: JSON.stringify({ threadId, entityType, entityId }),
      service: 'comm',
    });
  }

  async unlinkCommThread(threadId: string, entityType: string, entityId: string) {
    return this.fetch<void>(`/entity-links/by-entity`, {
      method: 'DELETE',
      body: JSON.stringify({ threadId, entityType, entityId }),
      service: 'comm',
    });
  }

  // Comm — Attachments
  async getCommAttachmentUrl(messageId: string, attachmentIndex: number) {
    return this.fetch<{ url: string; filename: string }>(`/messages/${messageId}/attachments/${attachmentIndex}`, { service: 'comm' });
  }
}

export const api = new ApiClient(API_BASE_URL, COMM_API_URL);
