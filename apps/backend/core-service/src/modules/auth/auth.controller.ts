import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, SignupDto, ForgotPasswordDto, ResetPasswordDto, VerifyClientOtpDto } from './dto';
import { Public } from './decorators';
import { RefreshTokenGuard } from './guards';
import { CurrentUser } from './decorators';
import { JwtPayload, ILoginResponse, ISignupResponse, IAuthTokens } from '@sentra-core/types';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<ILoginResponse> {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.login(dto, userAgent, ip);
  }

  @Public()
  @Post('signup')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  signup(@Body() dto: SignupDto, @Req() req: Request): Promise<ISignupResponse> {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.signup(dto, userAgent, ip);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('client/verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyClientOtp(@Body() dto: VerifyClientOtpDto): Promise<{ message: string }> {
    return this.authService.verifyClientOtp(dto);
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @CurrentUser() user: JwtPayload & { refreshToken: string },
    @Req() req: Request,
  ): Promise<IAuthTokens> {
    const rawRefreshToken = user.refreshToken;
    const userAgent = req.headers['user-agent'];
    const ip = req.ip || req.socket?.remoteAddress;
    return this.authService.refreshTokens(rawRefreshToken, userAgent, ip);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    if (!user.jti) throw new UnauthorizedException('Session identifier missing');
    return this.authService.logout(user.jti);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    await this.authService.logoutAllSessions(user.sub);
    return { message: 'All sessions revoked' };
  }

  @Get('my-sessions')
  async getMySessions(@CurrentUser() user: JwtPayload) {
    return this.authService.getUserSessions(user.sub, user.orgId, 'active');
  }

  @Delete('sessions/others')
  @HttpCode(HttpStatus.OK)
  async revokeOtherSessions(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    if (!user.jti) throw new UnauthorizedException('Session identifier missing');
    await this.authService.revokeAllExcept(user.sub, user.jti);
    return { message: 'Other sessions revoked' };
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  async revokeMySession(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    await this.authService.revokeOwnSession(id, user.sub);
    return { message: 'Session revoked' };
  }

  @Get('apps')
  getApps(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
  ) {
    return this.authService.getAvailableApps(userId, orgId);
  }

  @Get('my-apps')
  getMyApps(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
  ) {
    return this.authService.getAvailableApps(userId, orgId);
  }
}
