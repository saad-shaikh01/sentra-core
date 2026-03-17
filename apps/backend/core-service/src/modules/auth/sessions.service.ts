import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { AuthService } from './auth.service';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async getUserSessions(
    userId: string,
    organizationId: string,
    status: 'active' | 'all' = 'active',
    page = 1,
    limit = 20,
  ) {
    // Validate target user belongs to org
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.authService.getUserSessions(userId, organizationId, status, page, limit);
  }

  async revokeSession(sessionId: string, userId: string, adminId: string, reason?: string) {
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }
    if (session.revokedAt) {
      throw new BadRequestException('Session already revoked');
    }

    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
        revokedReason: 'ADMIN_REVOKED',
      },
    });
  }

  async revokeAllUserSessions(userId: string, adminId: string, organizationId: string, reason?: string) {
    // Validate user belongs to org
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: 'ADMIN_REVOKED',
      },
    });

    return { count: result.count };
  }
}
