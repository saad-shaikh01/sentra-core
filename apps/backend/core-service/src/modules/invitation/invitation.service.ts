import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';
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

@Injectable()
export class InvitationService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async createInvitation(
    dto: CreateInvitationDto,
    currentUser: JwtPayload,
  ): Promise<IInvitation> {
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

    const invitation = await this.prisma.invitation.create({
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

    console.log('='.repeat(60));
    console.log('[INVITATION CREATED]');
    console.log(`Email: ${dto.email}`);
    console.log(`Role: ${dto.role}`);
    console.log(`Token: ${token}`);
    console.log(`Invitation Link: http://localhost:4200/auth/accept-invite?token=${token}`);
    console.log('='.repeat(60));

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
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { organization: true },
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

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as UserRole,
      status: invitation.status as InvitationStatus,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      invitedById: invitation.invitedById,
      createdAt: invitation.createdAt,
      organizationName: invitation.organization.name,
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<ILoginResponse> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: dto.token },
      include: { organization: true },
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
          role: invitation.role,
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

    const tokens = await this.getTokens(
      result.id,
      result.email,
      result.organizationId,
      result.role,
    );

    await this.updateRefreshToken(result.id, tokens.refreshToken);

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
      },
    };
  }

  async linkInvitation(
    dto: LinkInvitationDto,
    currentUser: JwtPayload,
  ): Promise<{ message: string }> {
    const invitation = await this.prisma.invitation.findUnique({
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

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });
    });

    return { message: 'Successfully joined the organization' };
  }

  async getPendingInvitations(orgId: string): Promise<IInvitation[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: {
        organizationId: orgId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role as UserRole,
      status: inv.status as InvitationStatus,
      expiresAt: inv.expiresAt,
      organizationId: inv.organizationId,
      invitedById: inv.invitedById,
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
