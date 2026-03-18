import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService, UserStatus } from '@sentra-core/prisma-client';
import { createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../../common/mailer';
import { PendingInvitationsQueryDto } from './dto';

type InvitationRecord = Prisma.UserInvitationGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
        name: true;
      };
    };
  };
}>;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {}

  async sendInvite(userId: string, organizationId: string, adminId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
      },
      select: {
        id: true,
        email: true,
        status: true,
        firstName: true,
        lastName: true,
        name: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Employee not found');
    }
    if (user.status === UserStatus.ACTIVE) {
      throw new BadRequestException('User is already active');
    }
    if (user.status === UserStatus.DEACTIVATED) {
      throw new BadRequestException('Cannot invite a deactivated user');
    }

    const [organization, admin] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true },
      }),
      this.prisma.user.findFirst({
        where: { id: adminId, organizationId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
        },
      }),
    ]);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const inviteUrl = this.buildInviteUrl(rawToken);
    const firstName = user.firstName?.trim() || this.splitName(user.name).firstName || 'there';
    const inviterName = this.buildName(admin?.firstName, admin?.lastName, admin?.name) || 'An admin';

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: UserStatus.INVITED },
      });

      await tx.userInvitation.upsert({
        where: { userId },
        update: {
          organizationId,
          tokenHash,
          invitedBy: adminId,
          invitedAt: new Date(),
          expiresAt,
          acceptedAt: null,
          cancelledAt: null,
          emailSentAt: null,
        },
        create: {
          userId,
          organizationId,
          tokenHash,
          invitedBy: adminId,
          expiresAt,
        },
      });

      try {
        await this.mailerService.sendInviteEmail({
          to: user.email,
          firstName,
          inviterName,
          organizationName: organization.name,
          appName: 'HRMS',
          inviteUrl,
          expiresIn: '72 hours',
        });
      } catch (error) {
        await tx.userInvitation.deleteMany({ where: { userId } });
        throw error;
      }

      await tx.userInvitation.update({
        where: { userId },
        data: { emailSentAt: new Date() },
      });
    });

    return {
      message: 'Invitation sent',
      expiresAt,
    };
  }

  async resendInvite(userId: string, organizationId: string, adminId: string) {
    return this.sendInvite(userId, organizationId, adminId);
  }

  async cancelInvite(userId: string, organizationId: string, _adminId: string) {
    const updated = await this.prisma.userInvitation.updateMany({
      where: {
        userId,
        organizationId,
        acceptedAt: null,
        cancelledAt: null,
      },
      data: {
        cancelledAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new NotFoundException('No pending invitation found');
    }

    return { message: 'Invitation cancelled' };
  }

  async getPendingInvitations(organizationId: string, query: PendingInvitationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserInvitationWhereInput = {
      organizationId,
      acceptedAt: null,
      cancelledAt: null,
      expiresAt: { gt: new Date() },
    };

    const [invitations, total] = await this.prisma.$transaction([
      this.prisma.userInvitation.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              name: true,
            },
          },
        },
        orderBy: { invitedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userInvitation.count({ where }),
    ]);

    return {
      data: invitations.map((invitation) => this.mapPendingInvitation(invitation)),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private mapPendingInvitation(invitation: InvitationRecord) {
    const name = this.buildName(
      invitation.user.firstName,
      invitation.user.lastName,
      invitation.user.name,
    );

    return {
      invitationId: invitation.id,
      userId: invitation.userId,
      name,
      email: invitation.user.email,
      invitedAt: invitation.invitedAt,
      expiresAt: invitation.expiresAt,
      expiresIn: this.formatExpiresIn(invitation.expiresAt),
    };
  }

  private buildInviteUrl(token: string): string {
    const base =
      this.configService.get<string>('INVITE_ACCEPT_URL_BASE') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:4200';

    return `${base.replace(/\/$/, '')}/auth/accept-invite?token=${token}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildName(
    firstName?: string | null,
    lastName?: string | null,
    fallback?: string | null,
  ): string {
    const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim();
    return fullName || fallback?.trim() || '';
  }

  private splitName(name?: string | null): { firstName: string; lastName: string } {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) {
      return { firstName: '', lastName: '' };
    }

    const [firstName, ...rest] = trimmed.split(/\s+/);
    return {
      firstName,
      lastName: rest.join(' '),
    };
  }

  private formatExpiresIn(expiresAt: Date): string {
    const remainingMs = expiresAt.getTime() - Date.now();
    if (remainingMs <= 0) {
      return 'expired';
    }

    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    if (remainingHours >= 24) {
      const days = Math.ceil(remainingHours / 24);
      return `in ${days} day${days === 1 ? '' : 's'}`;
    }

    return `in ${remainingHours} hour${remainingHours === 1 ? '' : 's'}`;
  }
}
