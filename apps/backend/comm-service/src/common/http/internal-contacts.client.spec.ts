import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import { InternalContactsClient } from './internal-contacts.client';
import { requestContextStorage } from '../middleware/request-id.middleware';

describe('InternalContactsClient', () => {
  let client: InternalContactsClient;
  let http: {
    post: jest.Mock;
  };

  beforeEach(() => {
    http = {
      post: jest.fn(),
    };

    client = new InternalContactsClient(
      http as unknown as HttpService,
      {
        get: jest.fn((key: string, defaultValue?: string) => {
          if (key === 'CORE_SERVICE_URL') return 'http://core-service';
          if (key === 'INTERNAL_SERVICE_SECRET') return 'secret';
          return defaultValue;
        }),
      } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries 503 failures twice and returns [] after exhausting retries', async () => {
    const delaySpy = jest
      .spyOn(client as unknown as { delay: (ms: number) => Promise<void> }, 'delay')
      .mockResolvedValue(undefined);
    const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const serviceUnavailableError = new AxiosError(
      'service unavailable',
      '503',
      undefined,
      undefined,
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        config: {
          headers: new AxiosHeaders(),
        },
        data: {},
      },
    );

    http.post.mockImplementation(() => throwError(() => serviceUnavailableError));

    const result = await client.lookupByEmails('org-1', ['a@example.com']);

    expect(result).toEqual([]);
    expect(http.post).toHaveBeenCalledTimes(3);
    expect(delaySpy).toHaveBeenCalledTimes(2);
    expect(delaySpy).toHaveBeenNthCalledWith(1, 200);
    expect(delaySpy).toHaveBeenNthCalledWith(2, 200);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Contact lookup failed for org org-1 with 1 emails: service unavailable',
    );
  });

  it('returns [] and logs a warning on timeout errors', async () => {
    const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const timeoutError = new AxiosError('timeout of 5000ms exceeded', 'ECONNABORTED');

    http.post.mockImplementation(() => throwError(() => timeoutError));

    const result = await client.lookupByEmails('org-1', ['a@example.com']);

    expect(result).toEqual([]);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      'http://core-service/api/internal/contacts/by-emails',
      { organizationId: 'org-1', emails: ['a@example.com'] },
      {
        timeout: 5000,
        headers: {
          'x-service-secret': 'secret',
          'Content-Type': 'application/json',
        },
      },
    );
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Contact lookup failed for org org-1 with 1 emails: timeout of 5000ms exceeded',
    );
  });

  it('includes x-request-id in outbound headers when a request context is active', async () => {
    http.post.mockReturnValue(
      of({
        data: {
          data: [],
        },
      }),
    );

    await requestContextStorage.run({ requestId: 'req-123' }, async () => {
      await client.lookupByEmails('org-1', ['a@example.com']);
    });

    expect(http.post).toHaveBeenCalledWith(
      'http://core-service/api/internal/contacts/by-emails',
      { organizationId: 'org-1', emails: ['a@example.com'] },
      {
        timeout: 5000,
        headers: {
          'x-service-secret': 'secret',
          'Content-Type': 'application/json',
          'x-request-id': 'req-123',
        },
      },
    );
  });
});
