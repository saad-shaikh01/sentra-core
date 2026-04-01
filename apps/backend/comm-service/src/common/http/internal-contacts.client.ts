/**
 * InternalContactsClient
 *
 * HTTP client for the CORE-001 contact lookup endpoint.
 * Called after sync to auto-link threads to clients/leads.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { getCurrentRequestId } from '../middleware/request-id.middleware';

export interface ContactLookupResult {
  email: string;
  id: string;
  entityType: 'client' | 'lead';
  name: string;
}

@Injectable()
export class InternalContactsClient {
  private readonly logger = new Logger(InternalContactsClient.name);
  private readonly coreServiceUrl: string;
  private readonly serviceSecret: string;
  private readonly timeoutMs = 5000;
  private readonly maxRetries = 2;
  private readonly retryDelayMs = 200;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.coreServiceUrl = this.config.get<string>('CORE_SERVICE_URL', 'http://localhost:3001');
    this.serviceSecret = this.config.get<string>('INTERNAL_SERVICE_SECRET', '');
  }

  async searchContacts(
    organizationId: string,
    query: string,
  ): Promise<ContactLookupResult[]> {
    if (!query.trim()) return [];

    try {
      const requestId = getCurrentRequestId();
      const resp = await firstValueFrom(
        this.http.get<{ data: ContactLookupResult[] }>(
          `${this.coreServiceUrl}/api/internal/contacts/search`,
          {
            params: { organizationId, q: query },
            timeout: this.timeoutMs,
            headers: {
              'x-service-secret': this.serviceSecret,
              ...(requestId ? { 'x-request-id': requestId } : {}),
            },
          },
        ),
      );
      return resp.data.data ?? [];
    } catch (err) {
      this.logger.warn(
        `Contact search failed for org ${organizationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  async lookupByEmails(
    organizationId: string,
    emails: string[],
  ): Promise<ContactLookupResult[]> {
    if (emails.length === 0) return [];

    try {
      const resp = await this.postWithRetry(organizationId, emails);
      return resp.data.data ?? [];
    } catch (err) {
      this.logger.warn(
        `Contact lookup failed for org ${organizationId} with ${emails.length} emails: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  private async postWithRetry(
    organizationId: string,
    emails: string[],
  ): Promise<{ data: { data?: ContactLookupResult[] } }> {
    let attempt = 0;

    while (true) {
      try {
        const requestId = getCurrentRequestId();
        return await firstValueFrom(
          this.http.post<{ data: ContactLookupResult[] }>(
            `${this.coreServiceUrl}/api/internal/contacts/by-emails`,
            { organizationId, emails },
            {
              timeout: this.timeoutMs,
              headers: {
                'x-service-secret': this.serviceSecret,
                'Content-Type': 'application/json',
                ...(requestId ? { 'x-request-id': requestId } : {}),
              },
            },
          ),
        );
      } catch (error) {
        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }

        attempt += 1;
        await this.delay(this.retryDelayMs);
      }
    }
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (!(error instanceof AxiosError)) {
      return false;
    }

    return error.response?.status === 503 && attempt < this.maxRetries;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
