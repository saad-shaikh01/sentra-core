import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { UAParser } from 'ua-parser-js';
import { PrismaService } from '@sentra-core/prisma-client';
import { MailClientService } from '@sentra-core/mail-client';
import {
  OrganizationOnboardingMode,
  UserRole,
  AppCode,
  JwtPayload,
  IAuthTokens,
  ILoginResponse,
  ISignupResponse,
} from '@sentra-core/types';
import { v4 as uuidv4 } from 'uuid';
import { LoginDto, SignupDto, ForgotPasswordDto, ResetPasswordDto, VerifyClientOtpDto } from './dto';
import { IamService } from '../iam';
import { CacheService } from '../../common/cache/cache.service';
import { PermissionsService } from '../../common';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function parseDeviceInfo(userAgent: string): object {
  if (!userAgent) return { userAgent: '', deviceType: 'desktop' };
  const parser = new UAParser(userAgent);
  return {
    browser: parser.getBrowser().name || 'Unknown',
    browserVersion: parser.getBrowser().version || '',
    os: parser.getOS().name || 'Unknown',
    osVersion: parser.getOS().version || '',
    deviceType: parser.getDevice().type || 'desktop',
    userAgent: userAgent.substring(0, 200),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailClientService,
    private iamService: IamService,
    private cacheService: CacheService,
    private permissionsService: PermissionsService,
  ) {}

  private isPublicOwnerSignupEnabled(): boolean {
    const value = this.configService
      .get<string>('ALLOW_PUBLIC_OWNER_SIGNUP', 'true')
      .toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
  }

  async login(dto: LoginDto, userAgent?: string, ip?: string): Promise<ILoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated.',
      });
    }

    // Check user status (suspended/deactivated)
    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Contact your administrator.',
      });
    }

    if (user.status === 'DEACTIVATED') {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated.',
      });
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const appAccess = await this.iamService.getUserAppAccess(user.organizationId, user.id);
    const appCodes = appAccess.map((a) => a.appCode as AppCode);

    // Determine primary appCode for the refresh token
    const primaryAppCode = appCodes[0] || 'SALES';
    const deviceInfo = parseDeviceInfo(userAgent || '');

    const tokens = await this.issueTokenPair(
      user.id,
      user.email,
      user.organizationId,
      user.role,
      appCodes,
      primaryAppCode,
      deviceInfo,
      ip || '',
      null, // new familyId
    );

    return {
      ...tokens,
      user: {
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
      },
      appAccess,
    };
  }

  async loginAfterInviteAcceptance(
    userId: string,
    userAgent?: string,
    ip?: string,
  ): Promise<ILoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive || user.status === 'DEACTIVATED') {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated.',
      });
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Contact your administrator.',
      });
    }

    const appAccess = await this.iamService.getUserAppAccess(user.organizationId, user.id);
    const appCodes = appAccess.map((access) => access.appCode as AppCode);
    const primaryAppCode = appCodes[0] || AppCode.HRMS;
    const deviceInfo = parseDeviceInfo(userAgent || '');

    const tokens = await this.issueTokenPair(
      user.id,
      user.email,
      user.organizationId,
      user.role,
      appCodes,
      primaryAppCode,
      deviceInfo,
      ip || '',
      null,
    );

    return {
      ...tokens,
      user: {
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
      },
      appAccess,
    };
  }

  async signup(dto: SignupDto, userAgent?: string, ip?: string): Promise<ISignupResponse> {
    if (!this.isPublicOwnerSignupEnabled()) {
      throw new ForbiddenException(
        'Public owner signup is disabled. Ask organization admin for an invitation.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const existingOrg = await this.prisma.organization.findFirst({
      where: { name: dto.organizationName },
      select: { id: true },
    });
    if (existingOrg) {
      throw new ConflictException(
        'Organization already exists. Team members must join via invitation.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          onboardingMode: OrganizationOnboardingMode.PUBLIC_OWNER_SIGNUP,
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          role: UserRole.OWNER,
          organizationId: organization.id,
          status: 'ACTIVE',
        },
        include: { organization: true },
      });

      return { user, organization };
    });

    await this.iamService.bootstrapOwnerEntitlements(
      result.organization.id,
      result.user.id,
    );

    const appAccess = await this.iamService.getUserAppAccess(
      result.organization.id,
      result.user.id,
    );
    const appCodes = appAccess.map((a) => a.appCode as AppCode);
    const primaryAppCode = appCodes[0] || 'SALES';
    const deviceInfo = parseDeviceInfo(userAgent || '');

    const tokens = await this.issueTokenPair(
      result.user.id,
      result.user.email,
      result.organization.id,
      result.user.role,
      appCodes,
      primaryAppCode,
      deviceInfo,
      ip || '',
      null,
    );

    await this.mailService.sendMail({
      to: result.user.email,
      subject: 'Welcome to SentraCore',
      template: 'WELCOME',
      context: {
        name: result.user.name,
        organizationName: result.organization.name,
      },
    });

    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role as UserRole,
        avatarUrl: result.user.avatarUrl,
        jobTitle: result.user.jobTitle,
        phone: result.user.phone,
        bio: result.user.bio,
        isActive: result.user.isActive,
        organizationId: result.user.organizationId,
        organization: result.organization,
        createdAt: result.user.createdAt,
        updatedAt: result.user.updatedAt,
        appAccess,
      },
      organization: result.organization,
      appAccess,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      return { message: 'If an account exists, a reset link has been sent.' };
    }

    const resetToken = uuidv4();
    const resetPasswordExpires = new Date();
    resetPasswordExpires.setHours(resetPasswordExpires.getHours() + 1);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpires,
      },
    });

    const resetLink = `${this.configService.get<string>(
      'FRONTEND_URL',
    ) || 'http://localhost:4200'}/auth/reset-password?token=${resetToken}`;

    await this.mailService.sendMail({
      to: dto.email,
      subject: 'Password Reset Request',
      template: 'PASSWORD_RESET',
      context: {
        name: user.name,
        resetLink,
      },
    });

    return { message: 'If an account exists, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { resetPasswordToken: dto.token },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (user.resetPasswordExpires && new Date() > user.resetPasswordExpires) {
      throw new BadRequestException('Reset token has expired');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    // Revoke all sessions on password change
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'PASSWORD_CHANGED' },
    });

    return { message: 'Password has been reset successfully' };
  }

  async verifyClientOtp(dto: VerifyClientOtpDto): Promise<{ message: string }> {
    const client = await this.prisma.client.findFirst({
      where: {
        email: dto.email,
        portalAccess: true,
        emailVerified: false,
        emailOtpExpiry: { gte: new Date() },
      },
    });

    if (!client || !client.emailOtp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const valid = await bcrypt.compare(dto.otp, client.emailOtp);
    if (!valid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.prisma.client.update({
      where: { id: client.id },
      data: {
        emailVerified: true,
        emailOtp: null,
        emailOtpExpiry: null,
      },
    });

    return { message: 'Email verified. Please set your password to continue.' };
  }

  async refreshTokens(rawRefreshToken: string, userAgent?: string, ip?: string): Promise<IAuthTokens> {
    // 1. Decode without verification to get jti
    let decoded: { sub?: string; jti?: string; familyId?: string } | null = null;
    try {
      decoded = this.jwtService.decode(rawRefreshToken) as { sub?: string; jti?: string; familyId?: string };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (!decoded?.jti) throw new UnauthorizedException('Invalid token');

    // 2. Load from DB
    const storedToken = await this.prisma.refreshToken.findUnique({ where: { id: decoded.jti } });
    if (!storedToken) throw new UnauthorizedException('Session not found');

    // 3. Reuse detection (AUTH-002): if already ROTATED, revoke entire family
    if (storedToken.revokedAt && storedToken.revokedReason === 'ROTATED') {
      if (storedToken.familyId) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: storedToken.familyId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' },
        });
      }
      throw new UnauthorizedException('Security event: session invalidated');
    }

    // 4. Check if revoked (any other reason)
    if (storedToken.revokedAt) throw new UnauthorizedException('Session revoked');

    // 5. Check expiry
    if (storedToken.expiresAt < new Date()) throw new UnauthorizedException('Session expired');

    // 6. Verify hash
    if (storedToken.tokenHash !== hashToken(rawRefreshToken)) {
      throw new UnauthorizedException('Invalid token');
    }

    // 7. Verify JWT signature
    try {
      this.jwtService.verify(rawRefreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    // 8. Update lastUsedAt (AUTH-002)
    await this.prisma.refreshToken.update({
      where: { id: decoded.jti },
      data: { lastUsedAt: new Date() },
    });

    // 9. Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: decoded.jti },
      data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
    });

    // 10. Get user info for new token
    const user = await this.prisma.user.findUnique({
      where: { id: storedToken.userId },
      select: { id: true, email: true, role: true, organizationId: true, isActive: true, status: true },
    });

    if (!user || !user.isActive) throw new UnauthorizedException('User not found');
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Contact your administrator.',
      });
    }

    const appAccess = await this.iamService.getUserAppAccess(storedToken.organizationId || user.organizationId, user.id);
    const appCodes = appAccess.map((a) => a.appCode as AppCode);

    // Determine device info
    const deviceInfo = userAgent
      ? parseDeviceInfo(userAgent)
      : (storedToken.deviceInfo as object || {});

    // 11. Issue new token pair (same familyId)
    return this.issueTokenPair(
      storedToken.userId,
      user.email,
      storedToken.organizationId || user.organizationId,
      user.role,
      appCodes,
      storedToken.appCode,
      deviceInfo,
      ip || storedToken.ipAddress || '',
      storedToken.familyId, // same familyId
    );
  }

  async logout(jti: string): Promise<{ message: string }> {
    await this.prisma.refreshToken.updateMany({
      where: { id: jti, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    });
    return { message: 'Logged out successfully' };
  }

  async logoutAllSessions(userId: string, reason: string = 'LOGOUT'): Promise<{ revokedCount: number }> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return { revokedCount: result.count };
  }

  async suspendUser(userId: string, adminId: string, organizationId: string, reason: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === 'SUSPENDED') throw new BadRequestException('User already suspended');
    if (user.id === adminId) throw new BadRequestException('Cannot suspend yourself');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendedBy: adminId,
        suspendReason: reason,
      },
    });

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'USER_SUSPENDED' },
    });

    // Add to Redis blacklist (TTL = 900s = 15 min, matches access token TTL)
    // CacheService.set uses ms, so 900 * 1000
    await this.cacheService.set(`suspended:${userId}`, '1', 900 * 1000);

    return { message: 'User suspended and all sessions revoked', revokedSessions: revoked.count };
  }

  async unsuspendUser(userId: string, adminId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== 'SUSPENDED') throw new BadRequestException('User is not suspended');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'ACTIVE',
        suspendedAt: null,
        suspendedBy: null,
        suspendReason: null,
      },
    });

    await this.cacheService.del(`suspended:${userId}`);

    return { message: 'User unsuspended' };
  }

  async getAvailableApps(userId: string, orgId: string) {
    return this.iamService.getUserAppAccess(orgId, userId);
  }

  async getMyApps(userId: string, orgId: string) {
    return this.iamService.getMyApps(userId, orgId);
  }

  async getMyPermissions(userId: string, orgId: string) {
    return this.permissionsService.getUserPermissions(userId, orgId);
  }

  async getUserSessions(userId: string, organizationId: string | null, status: 'active' | 'all' = 'active', page = 1, limit = 20) {
    const where: Record<string, unknown> = { userId };
    if (organizationId) where.organizationId = organizationId;

    if (status === 'active') {
      where.revokedAt = null;
      where.expiresAt = { gt: new Date() };
    }

    const [items, total] = await Promise.all([
      this.prisma.refreshToken.findMany({
        where,
        orderBy: [{ revokedAt: 'asc' }, { lastUsedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.refreshToken.count({ where }),
    ]);

    const now = new Date();
    const appLabels: Record<string, string> = {
      SALES: 'Sales Dashboard',
      PM: 'PM Dashboard',
      HRMS: 'HRMS',
      ADMIN: 'Admin',
      COMM: 'Comm',
    };

    const data = items.map((t) => ({
      id: t.id,
      appCode: t.appCode,
      appLabel: appLabels[t.appCode] || t.appCode,
      deviceInfo: t.deviceInfo,
      ipAddress: t.ipAddress,
      lastUsedAt: t.lastUsedAt?.toISOString() || null,
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      revokedAt: t.revokedAt?.toISOString() || null,
      revokedReason: t.revokedReason,
      isActive: !t.revokedAt && t.expiresAt > now,
    }));

    const active = data.filter((s) => s.isActive).length;

    return {
      data,
      meta: {
        total,
        active,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async revokeOwnSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.refreshToken.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new NotFoundException('Session not found');
    if (session.revokedAt) throw new BadRequestException('Session already revoked');
    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    });
  }

  async revokeAllExcept(userId: string, currentJti: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, id: { not: currentJti }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    });
  }

  async acceptInvite(
    token: string,
    password: string,
    confirmPassword: string,
    userAgent?: string,
    ip?: string,
  ): Promise<IAuthTokens> {
    if (!token || token.trim() === '') {
      throw new BadRequestException('Invalid or expired invitation link');
    }

    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const invitation = await this.prisma.userInvitation.findFirst({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid or expired invitation link');
    }
    if (invitation.acceptedAt) {
      throw new BadRequestException('This invitation has already been used');
    }
    if (invitation.cancelledAt) {
      throw new BadRequestException('This invitation has been cancelled');
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException(
        'This invitation has expired. Please ask your admin to resend it.',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: invitation.userId },
        data: { password: hashedPassword, status: 'ACTIVE', isActive: true },
      });
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
    });

    const user = invitation.user;
    const appAccess = await this.iamService.getUserAppAccess(user.organizationId, user.id);
    const appCodes = appAccess.map((a) => a.appCode as AppCode);
    const primaryAppCode = appCodes[0] || 'SALES';
    const deviceInfo = parseDeviceInfo(userAgent || '');

    return this.issueTokenPair(
      user.id,
      user.email,
      user.organizationId,
      user.role,
      appCodes,
      primaryAppCode,
      deviceInfo,
      ip || '',
      null,
    );
  }

  async getInviteInfo(
    token: string,
  ): Promise<{ firstName: string; email: string; orgName: string }> {
    if (!token?.trim()) {
      throw new BadRequestException({ code: 'INVALID', message: 'No token provided' });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await this.prisma.userInvitation.findFirst({
      where: { tokenHash },
      include: {
        user: { select: { firstName: true, name: true, email: true } },
      },
    });

    if (!invitation) {
      throw new BadRequestException({
        code: 'INVALID',
        message: 'Invalid or expired invitation',
      });
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException({
        code: 'ALREADY_USED',
        message: 'This invitation has already been used',
      });
    }

    if (invitation.cancelledAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'INVALID',
        message: 'Invitation expired or cancelled',
      });
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { name: true },
    });

    const firstName =
      invitation.user.firstName?.trim() ||
      invitation.user.name?.trim().split(/\s+/)[0] ||
      '';

    return {
      firstName,
      email: invitation.user.email,
      orgName: org?.name ?? '',
    };
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    organizationId: string,
    role: string,
    appCodes: AppCode[],
    appCode: string,
    deviceInfo: object,
    ip: string,
    existingFamilyId: string | null,
  ): Promise<IAuthTokens> {
    const familyId = existingFamilyId || randomUUID();
    const jti = uuidv4();

    const rawRefreshToken = await this.jwtService.signAsync(
      { sub: userId, jti, familyId },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: 604800,
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        organizationId,
        appCode,
        tokenHash: hashToken(rawRefreshToken),
        deviceInfo,
        ipAddress: ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        familyId,
      },
    });

    const payload: JwtPayload = {
      sub: userId,
      email,
      orgId: organizationId,
      role: role as UserRole,
      appCodes,
      jti,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: 900,
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
