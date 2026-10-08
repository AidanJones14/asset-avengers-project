import { Logger } from '@nestjs/common';

export type AuthEvent =
  | 'register'
  | 'login_success'
  | 'login_failure'
  | 'refresh'
  | 'refresh_reuse_detected'
  | 'logout';

const logger = new Logger('Auth');

// Lecture 14's structural fix: there is no parameter for a password or a token,
// so one can never end up in the logs by accident. Log the user's id, not their email.
export function logAuthEvent(event: AuthEvent, userId?: string): void {
  logger.log(`${event}${userId ? ` user=${userId}` : ''}`);
}
