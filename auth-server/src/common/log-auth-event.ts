import { Logger } from '@nestjs/common';

export type AuthEvent =
  | 'mfa_failure'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'mfa_verified'
  | 'password_reset'
  | 'register'
  | 'login_success'
  | 'login_failure'
  | 'login_refused_disabled'
  | 'refresh'
  | 'refresh_reuse_detected'
  | 'logout'
  // Staff security: account management (user = the acting admin, target = the account changed).
  | 'initial_password_set'
  | 'staff_created'
  | 'staff_disabled'
  | 'staff_enabled'
  // Temporary dev switch (auth/dev-mfa-bypass.ts): a dev account signed in without a code.
  | 'mfa_bypassed';

const logger = new Logger('Auth');

// Lecture 14's structural fix: there is no parameter for a password or a token,
// so one can never end up in the logs by accident. Log the user's id, not their email.
// targetId: the account an admin acted on (staff routes); also an id, never an email.
export function logAuthEvent(event: AuthEvent, userId?: string, targetId?: string): void {
  logger.log(`${event}${userId ? ` user=${userId}` : ''}${targetId ? ` target=${targetId}` : ''}`);
}
