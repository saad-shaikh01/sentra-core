export interface TeamTypeRecord {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  organizationId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TeamManager {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface TeamMemberRecord {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'MEMBER' | 'LEAD';
  jobTitle: string | null;
  joinedAt: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  type: TeamTypeRecord;
  manager: TeamManager | null;
  memberCount: number;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamDetail extends TeamSummary {
  members: TeamMemberRecord[];
}

export interface TeamListResponse {
  data: TeamSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface DepartmentRecord {
  id: string;
  name: string;
  description: string | null;
  employeeCount: number;
  createdAt: string;
  updatedAt: string;
}
