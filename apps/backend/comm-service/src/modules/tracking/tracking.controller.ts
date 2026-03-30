import {
  Controller,
  Get,
  Headers,
  Logger,
  Optional,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { MetricsService } from '../../common/metrics/metrics.service';
import { TrackingService } from './tracking.service';

@SkipThrottle()
@Controller('track')
export class TrackingController {
  private readonly logger = new Logger(TrackingController.name);

  constructor(
    private readonly trackingService: TrackingService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  @Get('o/:token.gif')
  async captureOpenPixel(
    @Param('token') token: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('referer') referer: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    this.metrics?.incrementPixelRequest('received');
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Content-Length', String(this.trackingService.getTrackingPixel().length));
    res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    void this.trackingService
      .captureOpenPixel(token, {
        ip: (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
        userAgent,
        referer,
      })
      .then(() => {
        this.metrics?.incrementPixelRequest('logged');
      })
      .catch((error) => {
        this.metrics?.incrementPixelRequest('error');
        this.metrics?.incrementTrackingFailure('pixel_capture');
        this.logger.warn(
          `Open pixel logging failed for token ${token.slice(0, 8)}...: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    return this.trackingService.getTrackingPixel();
  }
}
