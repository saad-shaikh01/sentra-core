import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { IUserProfile, UserRole } from '@sentra-core/types';
import { UpdateProfileDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string): Promise<IUserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

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
    };
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
    };
  }
}
