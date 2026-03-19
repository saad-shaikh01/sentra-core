import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private messaging: admin.messaging.Messaging | null = null;

  onModuleInit() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase Admin not configured — push notifications disabled. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY env vars.');
      return;
    }

    try {
      // Avoid double-init if module is reloaded
      const app = admin.apps.length
        ? admin.app()
        : admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
          });
      this.messaging = admin.messaging(app);
      this.logger.log('Firebase Admin SDK initialized');
    } catch (err) {
      this.logger.error('Firebase Admin init failed:', err);
    }
  }

  async sendMulticast(opts: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void> {
    if (!this.messaging || opts.tokens.length === 0) return;

    try {
      const response = await this.messaging.sendEachForMulticast({
        tokens: opts.tokens,
        notification: { title: opts.title, body: opts.body },
        data: opts.data,
        webpush: {
          notification: {
            title: opts.title,
            body: opts.body,
            icon: '/icon-192.png',
            badge: '/badge-72.png',
          },
          fcmOptions: { link: opts.data?.url ?? '/' },
        },
      });

      const failCount = response.responses.filter((r) => !r.success).length;
      if (failCount > 0) {
        this.logger.warn(`FCM: ${failCount}/${opts.tokens.length} messages failed`);
      }
    } catch (err) {
      // Non-fatal — log only
      this.logger.error('FCM sendMulticast error (non-fatal):', err);
    }
  }

  isConfigured(): boolean {
    return this.messaging !== null;
  }
}
