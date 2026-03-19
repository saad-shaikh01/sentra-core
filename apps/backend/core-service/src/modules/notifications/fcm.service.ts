import { Injectable } from '@nestjs/common';

// Stub for now — will be replaced by NOTIF-012
@Injectable()
export class FcmService {
  async sendMulticast(_opts: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void> {
    // TODO: implemented in NOTIF-012
    return;
  }
}
