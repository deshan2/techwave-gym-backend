
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const password = this.configService.get<string>('SMTP_PASSWORD');
    const fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL');
    const fromName =
      this.configService.get<string>('SMTP_FROM_NAME') || 'Gym Management';

    if (!host || !user || !password || !fromEmail) {
      throw new ServiceUnavailableException(
        'Email service is not configured',
      );
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException(
        'Invalid SMTP port configuration',
      );
    }

    const secure =
      this.configService.get<string>('SMTP_SECURE') === 'true';

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass: password,
      },
    });

    try {
      const result = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
      });

      return {
        messageId: result.messageId,
        accepted: result.accepted,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Unable to send email. Please try again later.',
      );
    }
  }
}
