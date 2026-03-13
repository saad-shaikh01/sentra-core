import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
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
  login(@Body() dto: LoginDto): Promise<ILoginResponse> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('signup')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  signup(@Body() dto: SignupDto): Promise<ISignupResponse> {
    return this.authService.signup(dto);
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

  @UseGuards(RefreshTokenGuard)
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshTokens(
    @CurrentUser('sub') userId: string,
    @CurrentUser() user: JwtPayload & { refreshToken: string },
  ): Promise<IAuthTokens> {
    return this.authService.refreshTokens(userId, user.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser('sub') userId: string): Promise<{ message: string }> {
    return this.authService.logout(userId);
  }

  @Get('apps')
  getApps(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
  ) {
    return this.authService.getAvailableApps(userId, orgId);
  }
}
