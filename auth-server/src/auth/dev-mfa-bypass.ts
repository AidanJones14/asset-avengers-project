import { Logger } from '@nestjs/common';

// TEMPORARY development switch (staff-security iteration 2, T1). With DEV_MFA_BYPASS=true, these
// seeded accounts sign in with their password alone and get the same MFA-verified session a correct
// code gives. Off by default; never turn it on for a shared or deployed machine.
// To remove: delete this file and dev-mfa-bypass.spec.ts, the check in AuthService.login,
// 'mfa_bypassed' in log-auth-event.ts, DEV_MFA_BYPASS in env.ts, docker-compose.yml and both
// .env.example files, and the dev.* block in DB/auth_db_test_data.sql.
export const DEV_MFA_BYPASS_ACCOUNTS = [
  'dev.superadmin@example.com',
  'dev.admin@example.com',
  'dev.analyst@example.com',
];

// The check AuthService.login uses: always false while the switch is off.
export function devMfaBypass(enabled: boolean): (email: string) => boolean {
  if (!enabled) return () => false;
  new Logger('Auth').warn(
    `DEV_MFA_BYPASS is on: ${DEV_MFA_BYPASS_ACCOUNTS.join(', ')} sign in without MFA. Local development only.`,
  );
  return (email) => DEV_MFA_BYPASS_ACCOUNTS.includes(email);
}
