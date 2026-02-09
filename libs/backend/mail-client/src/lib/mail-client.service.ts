import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  template: 'WELCOME' | 'INVITATION' | 'PASSWORD_RESET';
  context: any;
}

@Injectable()
export class MailClientService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailClientService.name);

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendMail(options: SendMailOptions) {
    const html = this.getTemplate(options.template, options.context);

    try {
      const info = await this.transporter.sendMail({
        from: `"SentraCore" <${this.configService.get<string>('SMTP_USER')}>`,
        to: options.to,
        subject: options.subject,
        html: html,
      });

      this.logger.log(`Email sent successfully: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      throw error;
    }
  }

  private getTemplate(template: string, context: any): string {
    switch (template) {
      case 'WELCOME':
        return `
          <div style="font-family: sans-serif; padding: 20px;">
            <h1>Welcome to SentraCore, ${context.name}!</h1>
            <p>Your organization <b>${context.organizationName}</b> has been successfully created.</p>
            <p>You can now start managing your brands and leads.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/dashboard" 
               style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Go to Dashboard
            </a>
          </div>
        `;

      case 'INVITATION':
        return `
          <div style="font-family: sans-serif; padding: 20px;">
            <h1>You're Invited!</h1>
            <p>You have been invited to join <b>${context.organizationName}</b> as a <b>${context.role}</b>.</p>
            <p>Click the button below to accept the invitation:</p>
            <a href="${context.inviteLink}" 
               style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Accept Invitation
            </a>
            <p style="margin-top: 20px; font-size: 12px; color: #666;">This link will expire in 7 days.</p>
          </div>
        `;

      case 'PASSWORD_RESET':
        return `
          <div style="font-family: sans-serif; padding: 20px;">
            <h1>Password Reset Request</h1>
            <p>Hello ${context.name},</p>
            <p>We received a request to reset your password. Click the button below to proceed:</p>
            <a href="${context.resetLink}" 
               style="background: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Reset Password
            </a>
            <p style="margin-top: 20px; font-size: 12px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `;

      default:
        return `<p>${JSON.stringify(context)}</p>`;
    }
  }
}
