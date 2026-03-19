import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IUserProfile, UserRole } from '@sentra-core/types';
import { UpdateProfileDto } from './dto';
import { IamService } from '../iam';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private iamService: IamService,
  ) {}

  async getMe(userId: string): Promise<IUserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    const appAccess = await this.iamService.getUserAppAccess(user.organizationId, user.id);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      avatarUrl: user.avatarUrl,
      jobTitle: user.jobTitle,
      phone: user.phone,
      bio: user.bio,
      isActive: user.isActive,
      organizationId: user.organizationId,
      organization: user.organization,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      appAccess,
    };
  }

  async searchUsers(
    orgId: string,
    q: string,
  ): Promise<{ id: string; name: string; email: string }[]> {
    if (!q || q.trim().length < 1) return [];

    return this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 10,
    });
  }

  async updateMe(userId: string, dto: UpdateProfileDto): Promise<IUserProfile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        jobTitle: dto.jobTitle,
        phone: dto.phone,
        bio: dto.bio,
      },
      include: { organization: true },
    });
    const appAccess = await this.iamService.getUserAppAccess(user.organizationId, user.id);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      avatarUrl: user.avatarUrl,
      jobTitle: user.jobTitle,
      phone: user.phone,
      bio: user.bio,
      isActive: user.isActive,
      organizationId: user.organizationId,
      organization: user.organization,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      appAccess,
    };
  }
}
