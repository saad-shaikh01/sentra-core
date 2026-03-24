import { isRefreshing, setRefreshing, pendingQueue, processQueue } from './refresh-mutex';
import { getTokens, setTokens as setTokensHelper, clearTokens as clearTokensHelper } from './tokens';
import { IMyAppAccess } from '@sentra-core/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const COMM_API_URL = process.env.NEXT_PUBLIC_COMM_API_URL || 'http://localhost:3002/api/comm';
const HRMS_API_URL = process.env.NEXT_PUBLIC_HRMS_API_URL || 'http://localhost:3004/api/hrms';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
  service?: 'comm';
}

export interface GSuiteDirectoryUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  isAdmin: boolean;
  isSuspended: boolean;
  orgUnitPath: string;
  lastLoginTime?: string;
  creationTime?: string;
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    searchParams.set(key, String(value));
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
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
  private refreshBaseUrl: string;

  constructor(
    baseUrl: string,
    commUrl: string = COMM_API_URL,
    refreshBaseUrl: string = API_BASE_URL,
  ) {
    this.baseUrl = baseUrl;
    this.commUrl = commUrl;
    this.refreshBaseUrl = refreshBaseUrl;
  }

  private getAccessToken(): string | null {
    return getTokens().accessToken;
  }

  setTokens(accessToken: string, refreshToken: string) {
    setTokensHelper(accessToken, refreshToken);
  }

  clearTokens() {
    clearTokensHelper();
  }

  async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { skipAuth = false, service, ...fetchOptions } = options;
    const baseUrl = service === 'comm' ? this.commUrl : this.baseUrl;
    const url = `${baseUrl}${endpoint}`;
    const isFormData =
      typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;

    const headers: HeadersInit = {
      ...fetchOptions.headers,
    };

    if (!isFormData) {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

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
      // Don't retry the refresh endpoint itself
      if (url.includes('/auth/refresh')) {
        clearTokensHelper();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        throw new Error('Session expired');
      }

      // If refresh already in progress, queue this request
      if (isRefreshing) {
        const newToken = await new Promise<string>((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        });
        (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { ...fetchOptions, headers });
      } else {
        // Start refresh — set mutex
        setRefreshing(true);
        try {
          const { refreshToken } = getTokens();
          if (!refreshToken) throw new Error('No refresh token');

          // Multi-tab race: check if another tab already refreshed while we waited
          const currentStoredRefresh = getTokens().refreshToken;
          if (currentStoredRefresh && currentStoredRefresh !== refreshToken) {
            const freshAccess = getTokens().accessToken;
            if (freshAccess) {
              processQueue(null, freshAccess);
              (headers as Record<string, string>)['Authorization'] = `Bearer ${freshAccess}`;
              response = await fetch(url, { ...fetchOptions, headers });
              return JSON.parse(await response.text() || '{}') as T;
            }
          }

          // Send refresh token in Authorization header (required by RefreshTokenGuard)
          const refreshResponse = await fetch(`${this.refreshBaseUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${refreshToken}`,
            },
          });

          if (!refreshResponse.ok) {
            // TOKEN_ROTATED means another tab just refreshed — recover instead of logging out
            const errBody = await refreshResponse.json().catch(() => ({}));
            const errCode = errBody?.code ?? errBody?.error?.code;
            if (errCode === 'TOKEN_ROTATED') {
              const freshAccess = getTokens().accessToken;
              const freshRefresh = getTokens().refreshToken;
              if (freshAccess && freshRefresh && freshRefresh !== refreshToken) {
                processQueue(null, freshAccess);
                (headers as Record<string, string>)['Authorization'] = `Bearer ${freshAccess}`;
                response = await fetch(url, { ...fetchOptions, headers });
                return JSON.parse(await response.text() || '{}') as T;
              }
            }
            throw new Error('Refresh failed');
          }

          const data = await refreshResponse.json();
          const { accessToken, refreshToken: newRefreshToken } =
            data.data ?? data;

          setTokensHelper(accessToken, newRefreshToken);
          processQueue(null, accessToken);

          (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
          response = await fetch(url, { ...fetchOptions, headers });
        } catch (refreshError) {
          processQueue(refreshError, null);
          clearTokensHelper();
          if (typeof window !== 'undefined') {
            window.location.href = '/auth/login';
          }
          throw refreshError;
        } finally {
          setRefreshing(false);
        }
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      const message =
        error?.error?.message ||
        error?.message ||
        `HTTP ${response.status}`;
      throw new Error(message);
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
      appAccess?: Array<{ appCode: string; appName: string; baseUrl?: string; isDefault: boolean }>;
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
      appAccess?: Array<{ appCode: string; appName: string; baseUrl?: string; isDefault: boolean }>;
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
      appAccess?: Array<{ appCode: string; appName: string; baseUrl?: string; isDefault: boolean }>;
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

  async uploadAvatar(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.fetch<any>('/users/me/avatar', {
      method: 'POST',
      body: form,
    });
  }

  // Organization endpoints
  async getMembers(params?: { role?: string }) {
    const qs = buildQueryString(params);
    return this.fetch<any[]>(`/organization/members${qs}`);
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
    const qs = buildQueryString(params);
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

  async uploadBrandLogo(id: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.fetch<any>(`/brands/${id}/upload/logo`, {
      method: 'POST',
      body: form,
    });
  }

  async deleteBrand(id: string) {
    return this.fetch<{ message: string }>(`/brands/${id}`, { method: 'DELETE' });
  }

  // Team-Brand endpoints
  async getTeamBrands() {
    return this.fetch<any[]>('/team-brands');
  }

  async assignBrandToTeam(teamId: string, brandId: string) {
    return this.fetch<any>('/team-brands', {
      method: 'POST',
      body: JSON.stringify({ teamId, brandId }),
    });
  }

  async unassignBrandFromTeam(brandId: string) {
    return this.fetch<{ ok: boolean }>(`/team-brands/${brandId}`, { method: 'DELETE' });
  }

  async reassignBrandToTeam(brandId: string, newTeamId: string) {
    return this.fetch<any>(`/team-brands/${brandId}/reassign/${newTeamId}`, { method: 'PATCH' });
  }

  // Lead endpoints
  async getLeads(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/leads${qs}`);
  }

  async getLead(id: string) {
    return this.fetch<any>(`/leads/${id}`);
  }

  async createLead(dto: Record<string, unknown>) {
    return this.fetch<any>('/leads', { method: 'POST', body: JSON.stringify(dto) });
  }

  async importLeads(formData: FormData) {
    return this.fetch<any>('/leads/import', {
      method: 'POST',
      body: formData,
    });
  }

  async updateLead(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteLead(id: string) {
    return this.fetch<{ message: string }>(`/leads/${id}`, { method: 'DELETE' });
  }

  async changeLeadStatus(
    id: string,
    dto: { status: string; followUpDate?: string; lostReason?: string },
  ) {
    return this.fetch<any>(`/leads/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  async assignLead(id: string, assignedToId: string) {
    return this.fetch<any>(`/leads/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ assignedToId }) });
  }

  async addLeadNote(id: string, content: string, mentionedUserIds?: string[]) {
    return this.fetch<any>(`/leads/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content, ...(mentionedUserIds?.length ? { mentionedUserIds } : {}) }),
    });
  }

  async editLeadNote(leadId: string, noteId: string, content: string) {
    return this.fetch<any>(`/leads/${leadId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async deleteLeadNote(leadId: string, noteId: string) {
    return this.fetch<{ message: string }>(`/leads/${leadId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  async convertLead(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(dto) });
  }

  async getLeadActivities(id: string) {
    return this.fetch<any[]>(`/leads/${id}/activities`);
  }

  async getTeamStats(teamId: string, period = 'this_month') {
    return this.fetch<any>(`/leads/teams/${teamId}/stats?period=${encodeURIComponent(period)}`);
  }

  async getFacebookIntegrations() {
    return this.fetch<any[]>('/integrations/facebook');
  }

  async createFacebookIntegration(dto: Record<string, unknown>) {
    return this.fetch<any>('/integrations/facebook', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateFacebookIntegration(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/integrations/facebook/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  async deleteFacebookIntegration(id: string) {
    return this.fetch<{ message: string }>(`/integrations/facebook/${id}`, {
      method: 'DELETE',
    });
  }

  async getInboundLeadWebhooks() {
    return this.fetch<any[]>('/integrations/inbound-webhooks');
  }

  async createInboundLeadWebhook(dto: Record<string, unknown>) {
    return this.fetch<any>('/integrations/inbound-webhooks', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateInboundLeadWebhook(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/integrations/inbound-webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  async deleteInboundLeadWebhook(id: string) {
    return this.fetch<{ message: string }>(`/integrations/inbound-webhooks/${id}`, {
      method: 'DELETE',
    });
  }

  // Client endpoints
  async getClients(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
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

  async assignClient(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/clients/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  async addClientNote(id: string, content: string, mentionedUserIds?: string[]) {
    return this.fetch<any>(`/clients/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content, ...(mentionedUserIds?.length ? { mentionedUserIds } : {}) }),
    });
  }

  async grantPortalAccess(id: string) {
    return this.fetch<{ message: string }>(`/clients/${id}/grant-portal-access`, {
      method: 'POST',
    });
  }

  async revokePortalAccess(id: string) {
    return this.fetch<{ message: string }>(`/clients/${id}/revoke-portal-access`, {
      method: 'POST',
    });
  }

  // Sale endpoints
  async getSales(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
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
    return this.fetch<any>(`/sales/${id}/cancel-subscription`, { method: 'POST' });
  }

  async getSalesSummary(params?: { brandId?: string; dateFrom?: string; dateTo?: string }) {
    const qs = buildQueryString(params ?? {});
    return this.fetch<any>(`/sales/summary${qs}`);
  }

  async refundSale(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/sales/${id}/refund`, { method: 'POST', body: JSON.stringify(dto) });
  }

  async chargebackSale(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/sales/${id}/chargeback`, { method: 'POST', body: JSON.stringify(dto) });
  }

  async recordPayment(id: string, dto: { amount: number; invoiceId?: string; invoiceNumber?: string; externalRef?: string; note: string }) {
    return this.fetch<any>(`/sales/${id}/record-payment`, { method: 'POST', body: JSON.stringify(dto) });
  }

  async addSaleNote(id: string, note: string) {
    return this.fetch<any>(`/sales/${id}/note`, { method: 'POST', body: JSON.stringify({ note }) });
  }

  async getInvoiceSummary(params?: { brandId?: string }) {
    const qs = buildQueryString(params ?? {});
    return this.fetch<any>(`/invoices/summary${qs}`);
  }

  // Invoice endpoints
  async getInvoices(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
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
    const response = await this.fetch<{ data?: { redirectUrl?: string }; redirectUrl?: string }>(
      `/identities/oauth/initiate${qs}`,
      { service: 'comm' },
    );
    return response.data ?? response;
  }

  async disconnectIdentity(id: string) {
    return this.fetch<void>(`/identities/${id}`, { method: 'DELETE', service: 'comm' });
  }

  async setDefaultIdentity(id: string) {
    return this.fetch<void>(`/identities/${id}/default`, { method: 'PATCH', service: 'comm' });
  }

  // Comm — Threads
  async listCommThreads(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
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
    const qs = buildQueryString(params);
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
    const qs = buildQueryString(allParams);
    return this.fetch<any>(`/messages${qs}`, { service: 'comm' });
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

  // Teams endpoints
  async getTeams(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/teams${qs}`);
  }

  async getTeam(id: string) {
    return this.fetch<any>(`/teams/${id}`);
  }

  async createTeam(dto: Record<string, unknown>) {
    return this.fetch<any>('/teams', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateTeam(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteTeam(id: string) {
    return this.fetch<{ message: string }>(`/teams/${id}`, { method: 'DELETE' });
  }

  async addTeamMember(teamId: string, dto: { userId: string; role?: string }) {
    return this.fetch<any>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateTeamMember(teamId: string, userId: string, dto: { role: string }) {
    return this.fetch<any>(`/teams/${teamId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  async removeTeamMember(teamId: string, userId: string) {
    return this.fetch<any>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
  }

  async getTeamTypes() {
    return this.fetch<any>('/team-types');
  }

  async getEmployees(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/employees${qs}`);
  }

  // Packages endpoints
  async getPackages(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/packages${qs}`);
  }

  async createPackage(dto: Record<string, unknown>) {
    return this.fetch<any>('/packages', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updatePackage(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/packages/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deletePackage(id: string) {
    return this.fetch<{ message: string }>(`/packages/${id}`, { method: 'DELETE' });
  }

  // Analytics
  async getAnalyticsSummary() {
    return this.fetch<any>('/analytics/summary');
  }

  // Global search
  async search(q: string) {
    return this.fetch<any[]>(`/search?q=${encodeURIComponent(q)}`);
  }

  // Comm — Attachments
  async getCommAttachmentUrl(messageId: string, attachmentIndex: number) {
    return this.fetch<{ url: string; filename: string }>(`/messages/${messageId}/attachments/${attachmentIndex}`, { service: 'comm' });
  }

  // Comm — G Suite Integration
  async initiateGSuiteOAuth() {
    return this.fetch<{ data: { redirectUrl: string } }>('/gsuite/oauth/initiate', { service: 'comm' });
  }

  async getGSuiteConnection() {
    return this.fetch<{ data: { connected: boolean; adminEmail?: string; domain?: string; connectedAt?: string } }>('/gsuite/connection', { service: 'comm' });
  }

  async listGSuiteUsers(pageToken?: string) {
    const qs = pageToken ? `?pageToken=${pageToken}` : '';
    return this.fetch<{ users: GSuiteDirectoryUser[]; nextPageToken?: string }>(`/gsuite/users${qs}`, { service: 'comm' });
  }

  async disconnectGSuite() {
    return this.fetch<void>('/gsuite/connection', { method: 'DELETE', service: 'comm' });
  }

  async getPublicInvoice(token: string) {
    return this.fetch<any>(`/public/invoice/${token}`, { skipAuth: true });
  }

  async payPublicInvoice(token: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/public/invoice/${token}/pay`, {
      method: 'POST',
      body: JSON.stringify(dto),
      skipAuth: true,
    });
  }

  async inviteUser(email: string, role: string) {
    return this.fetch<unknown>('/organization/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  // Session management
  async getMySessions() {
    return this.fetch<any[]>('/auth/my-sessions');
  }

  async revokeSession(sessionId: string) {
    return this.fetch<void>(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
  }

  async revokeOtherSessions() {
    return this.fetch<void>('/auth/sessions/others', { method: 'DELETE' });
  }

  async getMyApps() {
    const response = await this.fetch<{ data: IMyAppAccess[] }>('/auth/my-apps');
    return response.data;
  }

  async getMyPermissions() {
    const response = await this.fetch<{ data: string[] }>('/auth/my-permissions');
    return response.data;
  }
}

export const api = new ApiClient(API_BASE_URL, COMM_API_URL, API_BASE_URL);
export const hrmsApi = new ApiClient(HRMS_API_URL, COMM_API_URL, API_BASE_URL);
