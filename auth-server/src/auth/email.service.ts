/** Resend is called only on the server. Email_Service is the project's existing
 * secret name; it is deliberately never exposed to either frontend bundle. */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
export interface EmailResult {
  id?: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  errorCode?: string;
}
@Injectable()
export class EmailService {
  private readonly client?: Resend;
  private readonly from: string;
  private readonly template: string;
  private readonly logger = new Logger(EmailService.name);
  constructor(config: ConfigService) {
    const key = config.get<string>('Email_Service');
    if (key) this.client = new Resend(key);
    this.from =
      config.get<string>('EMAIL_FROM') ||
      'Asset Avengers <onboarding@resend.dev>';
    this.template = config.get<string>('EMAIL_RESET_TEMPLATE_ID') || '';
  }
  async sendPasswordReset(
    to: string,
    code: string,
    requestId: string,
  ): Promise<EmailResult> {
    if (!this.client)
      return { retryable: false, errorCode: 'EMAIL_NOT_CONFIGURED' };
    try {
      // Optional remote templates are provisioned by setup-resend.mjs. A sending-only
      // key also works with the default plain-text message, without management access.
      const { data, error, headers } = await this.client.emails.send(
        {
          from: this.from,
          to: [to],
          subject: 'Reset your Endgame password',
          ...(this.template
            ? {
                template: {
                  id: this.template,
                  variables: { CODE: code, EXPIRES_MINUTES: 10 },
                },
              }
            : {
                text: `ENDGAME\nPassword reset\n\nYour reset code is: ${code}\n\nThis code expires 10 minutes after it was requested and works once.\nYour authenticator is still required after resetting your password.\n\nIf you did not request this reset, ignore this email.\nEndgame Trading by Asset Avengers`,
              }),
        },
        {
          idempotencyKey: `password-reset/${requestId}`,
          signal: AbortSignal.timeout(12000),
        },
      );
      if (error || !data) {
        const status = error?.statusCode;
        const raw = headers?.['retry-after'];
        const delay = raw
          ? Number.isFinite(Number(raw))
            ? Number(raw)
            : (Date.parse(raw) - Date.now()) / 1000
          : undefined;
        // Provider error text may contain addresses. Keep only safe classification.
        return {
          retryable:
            !status ||
            status === 429 ||
            status >= 500 ||
            error?.name === 'concurrent_idempotent_requests',
          errorCode: status ? `RESEND_HTTP_${status}` : 'RESEND_NETWORK_ERROR',
          retryAfterSeconds:
            delay !== undefined && Number.isFinite(delay)
              ? Math.max(1, delay)
              : undefined,
        };
      }
      this.logger.log(`password_reset_email accepted id=${data.id}`);
      return { id: data.id, retryable: false };
    } catch {
      return { retryable: true, errorCode: 'RESEND_NETWORK_ERROR' };
    }
  }
}
