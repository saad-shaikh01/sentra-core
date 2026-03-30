import { Request, Response } from 'express';
import { TrackingController } from './tracking.controller';

describe('TrackingController', () => {
  it('returns the pixel gif and does not block on async logging', async () => {
    const pixel = Buffer.from('gif-bytes');
    const trackingService = {
      getTrackingPixel: jest.fn().mockReturnValue(pixel),
      captureOpenPixel: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new TrackingController(trackingService as never);
    const response = {
      setHeader: jest.fn(),
    } as unknown as Response;

    const result = await controller.captureOpenPixel(
      'raw-token',
      {
        headers: { 'x-forwarded-for': '203.0.113.4' },
        ip: '127.0.0.1',
      } as unknown as Request,
      'GoogleImageProxy',
      'https://mail.googleusercontent.com',
      response,
    );

    expect(result).toBe(pixel);
    expect(trackingService.captureOpenPixel).toHaveBeenCalledWith('raw-token', {
      ip: '203.0.113.4',
      userAgent: 'GoogleImageProxy',
      referer: 'https://mail.googleusercontent.com',
    });
    expect((response.setHeader as jest.Mock).mock.calls).toEqual(
      expect.arrayContaining([
        ['Content-Type', 'image/gif'],
        ['Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate'],
      ]),
    );
  });
});
