import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
import { MailClientService } from '@sentra-core/mail-client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  UserRole,
  IInvitation,
  InvitationStatus,
  JwtPayload,
  ILoginResponse,
} from '@sentra-core/types';
import { CreateInvitationDto, AcceptInvitationDto, LinkInvitationDto } from './dto';
import { IamService } from '../iam';

@Injectable()
export class InvitationService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailClientService,
    private iamService: IamService,
  ) {}

  private isInviteV2Enabled(): boolean {
    return this.iamService.isInviteV2Enabled();
  }

  async createInvitation(
    dto: CreateInvitationDto,
    currentUser: JwtPayload,
  ): Promise<IInvitation> {
    const inviteV2Enabled = this.isInviteV2Enabled();

    if (dto.role === UserRole.OWNER) {
      throw new BadRequestException('Cannot invite someone as OWNER');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        organizationId: currentUser.orgId,
      },
    });

    if (existingUser) {
      throw new ConflictException('User is already a member of this organization');
    }

    const existingPendingInvite = await this.prisma.invitation.findFirst({
      where: {
        email: dto.email,
        organizationId: currentUser.orgId,
        status: 'PENDING',
      },
    });

    if (existingPendingInvite) {
      throw new ConflictException('An invitation is already pending for this email');
    }

    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          email: dto.email,
          role: dto.role,
          token,
          status: 'PENDING',
          expiresAt,
          organizationId: currentUser.orgId,
          invitedById: currentUser.sub,
        },
      });

      if (inviteV2Enabled) {
        const legacyBundles = await this.iamService.getDefaultLegacyBundles(
          currentUser.orgId,
          dto.role,
        );
        for (const bundle of legacyBundles) {
          await tx.invitationBundle.create({
            data: {
              invitationId: created.id,
              appId: bundle.appId,
              roleIds: bundle.roleIds as never,
              scopeGrants: bundle.scopeGrants as never,
            },
          });
        }
      }

      return created;
    });

    const organization = await this.prisma.organization.findUnique({
      where: { id: currentUser.orgId },
    });

    const inviteLink = `${this.configService.get<string>(
      'FRONTEND_URL',
    ) || 'http://localhost:4200'}/auth/accept-invite?token=${token}`;

    await this.mailService.sendMail({
      to: dto.email,
      subject: `You're Invited to ${organization.name}`,
      template: 'INVITATION',
      context: {
        organizationName: organization.name,
        role: dto.role,
        inviteLink,
      },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as UserRole,
      status: invitation.status as InvitationStatus,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      invitedById: invitation.invitedById,
      createdAt: invitation.createdAt,
    };
  }

  async getInvitationByToken(token: string): Promise<IInvitation & { organizationName: string }> {
    const inviteV2Enabled = this.isInviteV2Enabled();

    const invitation: any = inviteV2Enabled
      ? await this.prisma.invitation.findUnique({
          where: { token },
          include: {
            organization: true,
            bundles: {
              include: {
                app: { select: { code: true } },
              },
            },
          },
        })
      : await this.prisma.invitation.findUnique({
          where: { token },
          include: {
            organization: true,
          },
        });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Invitation is ${invitation.status.toLowerCase()}`);
    }

    if (new Date() > invitation.expiresAt) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Invitation has expired');
    }

    const bundles = inviteV2Enabled ? (invitation.bundles ?? []) : [];

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as UserRole | undefined,
      status: invitation.status as InvitationStatus,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      invitedById: invitation.invitedById,
      createdAt: invitation.createdAt,
      organizationName: invitation.organization.name,
      bundles: bundles.map((bundle: any) => ({
        appCode: bundle.app.code,
        roleIds: Array.isArray(bundle.roleIds) ? (bundle.roleIds as string[]) : [],
        scopeGrants: Array.isArray(bundle.scopeGrants) ? bundle.scopeGrants : [],
      })),
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<ILoginResponse> {
    const inviteV2Enabled = this.isInviteV2Enabled();

    const invitation: any = inviteV2Enabled
      ? await this.prisma.invitation.findUnique({
          where: { token: dto.token },
          include: {
            organization: true,
            bundles: {
              include: {
                app: { select: { id: true, code: true } },
              },
            },
          },
        })
      : await this.prisma.invitation.findUnique({
          where: { token: dto.token },
          include: {
            organization: true,
          },
        });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Invitation is ${invitation.status.toLowerCase()}`);
    }

    if (new Date() > invitation.expiresAt) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Invitation has expired');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists. Please login and link your invitation.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invitation.email,
          password: hashedPassword,
          name: dto.name,
          role: invitation.role ?? UserRole.FRONTSELL_AGENT,
          organizationId: invitation.organizationId,
        },
        include: { organization: true },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });

      return user;
    });

    if (inviteV2Enabled && Array.isArray(invitation.bundles) && invitation.bundles.length > 0) {
      await this.iamService.applyInvitationBundlesToUser(
        invitation.organizationId,
        result.id,
        invitation.bundles,
      );
    }

    const tokens = await this.getTokens(
      result.id,
      result.email,
      result.organizationId,
      result.role,
    );

    await this.updateRefreshToken(result.id, tokens.refreshToken);
    const appAccess = await this.iamService.getUserAppAccess(
      result.organizationId,
      result.id,
    );

    return {
      ...tokens,
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role as UserRole,
        avatarUrl: result.avatarUrl,
        jobTitle: result.jobTitle,
        phone: result.phone,
        bio: result.bio,
        isActive: result.isActive,
        organizationId: result.organizationId,
        organization: result.organization,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        appAccess,
      },
      appAccess,
    };
  }

  async linkInvitation(
    dto: LinkInvitationDto,
    currentUser: JwtPayload,
  ): Promise<{ message: string }> {
    const inviteV2Enabled = this.isInviteV2Enabled();

    const invitation: any = inviteV2Enabled
      ? await this.prisma.invitation.findUnique({
          where: { token: dto.token },
          include: {
            bundles: {
              include: {
                app: { select: { id: true, code: true } },
              },
            },
          },
        })
      : await this.prisma.invitation.findUnique({
          where: { token: dto.token },
        });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Invitation is ${invitation.status.toLowerCase()}`);
    }

    if (new Date() > invitation.expiresAt) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Invitation has expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.sub },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.email !== invitation.email) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    // Prevent silent organization switches for existing users.
    if (user.organizationId !== invitation.organizationId) {
      throw new ForbiddenException(
        'Cross-organization linking is not allowed. Ask admin to invite your organization account.',
      );
    }

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED' },
    });

    if (inviteV2Enabled && Array.isArray(invitation.bundles) && invitation.bundles.length > 0) {
      await this.iamService.applyInvitationBundlesToUser(
        invitation.organizationId,
        user.id,
        invitation.bundles,
      );
    }

    return { message: 'Successfully joined the organization' };
  }

  async getPendingInvitations(orgId: string): Promise<IInvitation[]> {
    const inviteV2Enabled = this.isInviteV2Enabled();

    const invitations: any[] = inviteV2Enabled
      ? await this.prisma.invitation.findMany({
          where: {
            organizationId: orgId,
            status: 'PENDING',
          },
          include: {
            bundles: {
              include: {
                app: { select: { code: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : await this.prisma.invitation.findMany({
          where: {
            organizationId: orgId,
            status: 'PENDING',
          },
          orderBy: { createdAt: 'desc' },
        });

    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role as UserRole | undefined,
      status: inv.status as InvitationStatus,
      expiresAt: inv.expiresAt,
      organizationId: inv.organizationId,
      invitedById: inv.invitedById,
      bundles: (inv.bundles ?? []).map((bundle: any) => ({
        appCode: bundle.app.code,
        roleIds: Array.isArray(bundle.roleIds) ? (bundle.roleIds as string[]) : [],
        scopeGrants: Array.isArray(bundle.scopeGrants) ? bundle.scopeGrants : [],
      })),
      createdAt: inv.createdAt,
    }));
  }

  async cancelInvitation(
    invitationId: string,
    currentUser: JwtPayload,
  ): Promise<{ message: string }> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.organizationId !== currentUser.orgId) {
      throw new ForbiddenException('Cannot cancel invitations from another organization');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Cannot cancel. Invitation is ${invitation.status.toLowerCase()}`);
    }

    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'CANCELLED' },
    });

    return { message: 'Invitation cancelled successfully' };
  }

  private async getTokens(
    userId: string,
    email: string,
    orgId: string,
    role: string,
  ) {
    const payload = {
      sub: userId,
      email,
      orgId,
      role: role as UserRole,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: 900, // 15 minutes
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: 604800, // 7 days
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }
}
