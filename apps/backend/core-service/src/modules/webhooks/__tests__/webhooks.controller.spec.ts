import { UnauthorizedException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { WebhooksController } from '../webhooks.controller';
import { WebhooksService } from '../webhooks.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let serviceMock: {
    verifyAuthorizeNetSignature: jest.Mock<boolean, [string, string]>;
    processEvent: jest.Mock<Promise<void>, [unknown]>;
  };

  beforeEach(() => {
    serviceMock = {
      verifyAuthorizeNetSignature: jest.fn<boolean, [string, string]>(),
      processEvent: jest.fn<Promise<void>, [unknown]>(),
    };

    controller = new WebhooksController(serviceMock as unknown as WebhooksService);
  });

  it('marks the webhook endpoint as public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, WebhooksController.prototype.handleAuthorizeNetWebhook)).toBe(true);
  });

  it('returns 200 for a valid signature', async () => {
    const body = Buffer.from(JSON.stringify({ notificationId: '1', eventType: 'x', eventDate: 'y', webhookId: 'z', payload: {} }));
    serviceMock.verifyAuthorizeNetSignature.mockReturnValue(true);
    serviceMock.processEvent.mockResolvedValue(undefined);

    await expect(
      controller.handleAuthorizeNetWebhook({ body } as any, 'sha512=VALID'),
    ).resolves.toEqual({ received: true });

    expect(serviceMock.verifyAuthorizeNetSignature).toHaveBeenCalled();
    expect(serviceMock.processEvent).toHaveBeenCalledTimes(1);
  });

  it('returns 401 for invalid or missing signature', async () => {
    serviceMock.verifyAuthorizeNetSignature.mockReturnValue(false);

    await expect(
      controller.handleAuthorizeNetWebhook({ body: Buffer.from('{}') } as any, ''),
    ).rejects.toThrow(UnauthorizedException);

    expect(serviceMock.processEvent).not.toHaveBeenCalled();
  });

  it('catches processEvent errors and does not propagate them to the HTTP response', async () => {
    const loggerErrorSpy = jest.spyOn((controller as any).logger, 'error').mockImplementation();
    const body = Buffer.from(JSON.stringify({ notificationId: '1', eventType: 'x', eventDate: 'y', webhookId: 'z', payload: {} }));
    serviceMock.verifyAuthorizeNetSignature.mockReturnValue(true);
    serviceMock.processEvent.mockRejectedValue(new Error('boom'));

    await expect(
      controller.handleAuthorizeNetWebhook({ body } as any, 'sha512=VALID'),
    ).resolves.toEqual({ received: true });

    await new Promise((resolve) => setImmediate(resolve));

    expect(loggerErrorSpy).toHaveBeenCalled();
    loggerErrorSpy.mockRestore();
  });
});
