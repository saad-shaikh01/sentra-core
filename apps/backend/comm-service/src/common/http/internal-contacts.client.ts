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

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.coreServiceUrl = this.config.get<string>('CORE_SERVICE_URL', 'http://localhost:3001');
    this.serviceSecret = this.config.get<string>('INTERNAL_SERVICE_SECRET', '');
  }

  async lookupByEmails(
    organizationId: string,
    emails: string[],
  ): Promise<ContactLookupResult[]> {
    if (emails.length === 0) return [];

    try {
      const resp = await firstValueFrom(
        this.http.post<{ data: ContactLookupResult[] }>(
          `${this.coreServiceUrl}/api/internal/contacts/by-emails`,
          { organizationId, emails },
          {
            headers: {
              'x-service-secret': this.serviceSecret,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return resp.data.data ?? [];
    } catch (err) {
      this.logger.warn(`Contact lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
}
