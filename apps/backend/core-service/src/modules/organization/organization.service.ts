import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { UserRole, IOrganizationMember, JwtPayload } from '@sentra-core/types';
import { UpdateRoleDto } from './dto';

@Injectable()
export class OrganizationService {
  constructor(private prisma: PrismaService) {}

  async getMembers(orgId: string): Promise<IOrganizationMember[]> {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      avatarUrl: user.avatarUrl,
      jobTitle: user.jobTitle,
      isActive: user.isActive,
      createdAt: user.createdAt,
    }));
  }

  async updateMemberRole(
    targetUserId: string,
    dto: UpdateRoleDto,
    currentUser: JwtPayload,
  ): Promise<IOrganizationMember> {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.organizationId !== currentUser.orgId) {
      throw new ForbiddenException('Cannot modify users from another organization');
    }

    if (targetUser.role === UserRole.OWNER) {
      throw new ForbiddenException('Cannot change the role of the organization owner');
    }

    if (dto.role === UserRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role. Transfer ownership instead.');
    }

    if (currentUser.role === UserRole.ADMIN && dto.role === UserRole.ADMIN) {
      const currentUserRecord = await this.prisma.user.findUnique({
        where: { id: currentUser.sub },
      });

      if (currentUserRecord?.role !== UserRole.OWNER) {
        throw new ForbiddenException('Only owners can promote users to Admin');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: dto.role },
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role as UserRole,
      avatarUrl: updatedUser.avatarUrl,
      jobTitle: updatedUser.jobTitle,
      isActive: updatedUser.isActive,
      createdAt: updatedUser.createdAt,
    };
  }

  async removeMember(
    targetUserId: string,
    currentUser: JwtPayload,
  ): Promise<{ message: string }> {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.organizationId !== currentUser.orgId) {
      throw new ForbiddenException('Cannot modify users from another organization');
    }

    if (targetUser.role === UserRole.OWNER) {
      throw new ForbiddenException('Cannot remove the organization owner');
    }

    if (targetUser.id === currentUser.sub) {
      throw new BadRequestException('Cannot remove yourself. Contact support.');
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
    });

    return { message: 'Member removed successfully' };
  }
}
