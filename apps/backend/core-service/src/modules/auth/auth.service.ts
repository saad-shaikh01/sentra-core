import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@sentra-core/prisma-client';
import { UserRole, JwtPayload, IAuthTokens, ILoginResponse, ISignupResponse } from '@sentra-core/types';
import { LoginDto, SignupDto, ForgotPasswordDto, ResetPasswordDto } from './dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<ILoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.getTokens(user.id, user.email, user.organizationId, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

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
      },
    };
  }

  async signup(dto: SignupDto): Promise<ISignupResponse> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          role: UserRole.OWNER,
          organizationId: organization.id,
        },
        include: { organization: true },
      });

      return { user, organization };
    });

    const tokens = await this.getTokens(
      result.user.id,
      result.user.email,
      result.organization.id,
      result.user.role,
    );
    await this.updateRefreshToken(result.user.id, tokens.refreshToken);

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
      },
      organization: result.organization,
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

    console.log(`[Password Reset] Token for ${dto.email}: ${resetToken}`);
    console.log(`[Password Reset] Reset link: http://localhost:4200/auth/reset-password?token=${resetToken}`);

    return { message: 'If an account exists, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    console.log(`[Password Reset] Token received: ${dto.token}`);

    throw new BadRequestException('Password reset not yet fully implemented');
  }

  async refreshTokens(userId: string, refreshToken: string): Promise<IAuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const refreshTokenMatches = await bcrypt.compare(refreshToken, user.refreshToken);

    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Access denied');
    }

    const tokens = await this.getTokens(user.id, user.email, user.organizationId, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    return { message: 'Logged out successfully' };
  }

  private async getTokens(
    userId: string,
    email: string,
    orgId: string,
    role: string,
  ): Promise<IAuthTokens> {
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
