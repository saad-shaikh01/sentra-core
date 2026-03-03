const CORE_API_URL = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:3001/api';
const PM_API_URL   = process.env.NEXT_PUBLIC_PM_API_URL   || 'http://localhost:3003/api/pm';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
  service?: 'core' | 'pm';
}

export interface PmSingleResponse<T> {
  data: T;
}

export interface PmMutationResponse {
  success: boolean;
  data?: any;
}

class ApiClient {
  private coreUrl: string;
  private pmUrl: string;

  constructor(coreUrl: string, pmUrl: string) {
    this.coreUrl = coreUrl;
    this.pmUrl   = pmUrl;
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
      const response = await fetch(`${this.coreUrl}/auth/refresh`, {
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
    const { skipAuth = false, service = 'core', ...fetchOptions } = options;
    const baseUrl = service === 'pm' ? this.pmUrl : this.coreUrl;
    
    // Normalize endpoint: ensure it doesn't double-prefix /pm
    let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (service === 'pm' && cleanEndpoint.startsWith('/pm/')) {
      cleanEndpoint = cleanEndpoint.substring(3); // Remove /pm
    }
    
    const url = `${baseUrl}${cleanEndpoint}`;

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

    return response.json();
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
      role: string;
      organizationName: string;
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

  // User endpoints
  async getMe() {
    return this.fetch<PmSingleResponse<any>>('/users/me');
  }

  async updateProfile(data: {
    name?: string;
    avatarUrl?: string;
    jobTitle?: string;
    phone?: string;
    bio?: string;
  }) {
    return this.fetch<PmSingleResponse<any>>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Organization endpoints
  async getMembers() {
    return this.fetch<any[]>('/organization/members');
  }

  async updateMemberRole(userId: string, role: string) {
    return this.fetch<PmSingleResponse<any>>(`/organization/members/${userId}/role`, {
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
    return this.fetch<PmSingleResponse<any>>('/organization/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  async getPendingInvitations() {
    return this.fetch<any[]>('/organization/invitations');
  }

  async cancelInvitation(invitationId: string) {
    return this.fetch<{ message: string }>(`/organization/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  }

  // Brand endpoints
  async getBrands(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/brands${qs}`);
  }

  async getBrand(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/brands/${id}`);
  }

  async createBrand(dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>('/brands', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateBrand(id: string, dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>(`/brands/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteBrand(id: string) {
    return this.fetch<{ message: string }>(`/brands/${id}`, { method: 'DELETE' });
  }

  // Client endpoints
  async getClients(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/clients${qs}`);
  }

  async getClient(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/clients/${id}`);
  }

  async createClient(dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>('/clients', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateClient(id: string, dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteClient(id: string) {
    return this.fetch<{ message: string }>(`/clients/${id}`, { method: 'DELETE' });
  }

  // PM (PM Service)
  async getProjects(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/projects${qs}`, { service: 'pm' });
  }

  async getProject(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/projects/${id}`, { service: 'pm' });
  }

  async createProject(dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>('/projects', { method: 'POST', body: JSON.stringify(dto), service: 'pm' });
  }

  async updateProject(id: string, dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(dto), service: 'pm' });
  }

  async getEngagements(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/engagements${qs}`, { service: 'pm' });
  }

  async getTemplates(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/templates${qs}`, { service: 'pm' });
  }

  async getStages(projectId: string, params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/projects/${projectId}/stages${qs}`, { service: 'pm' });
  }

  async getAllStages(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/stages${qs}`, { service: 'pm' });
  }

  async getTasksByStage(stageId: string, params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/stages/${stageId}/tasks${qs}`, { service: 'pm' });
  }

  async getMyTasks(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/my-tasks${qs}`, { service: 'pm' });
  }

  async getSubmissions(params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/submissions/queue/all${qs}`, { service: 'pm' });
  }

  async getSubmission(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/submissions/${id}`, { service: 'pm' });
  }

  async submitReview(submissionId: string, dto: Record<string, unknown>) {
    return this.fetch<PmMutationResponse>(`/submissions/${submissionId}/qc-reviews`, { 
      method: 'POST', 
      body: JSON.stringify(dto),
      service: 'pm' 
    });
  }
}

export const api = new ApiClient(CORE_API_URL, PM_API_URL);
