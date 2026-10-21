// auth-server's access policy (staff-security plan): who needs MFA (rule R) and which services
// a token is for. The trading backend's SecurityConfig applies the same MFA rule in Java.
// MFA is an allow-list of the single exception, so new roles need MFA by default.
// Staff access is the opposite: only the roles listed in STAFF_ROLES get it.

const CLIENT_ROLE = 'CLIENT';

// Roles that may use the staff service (internal-backend) and the staff-account routes.
export const STAFF_ROLES = ['ANALYST', 'ADMIN', 'SUPER_ADMIN'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaff(roles: unknown): boolean {
  return Array.isArray(roles) && roles.some((role) => (STAFF_ROLES as readonly unknown[]).includes(role));
}

// The `aud` claim: every token is for the trading API and auth-server; staff tokens are also
// for the staff service. Each verifier only accepts tokens that name it.
export function audiencesFor(
  roles: unknown,
  names: { api: string; auth: string; staff: string },
): string[] {
  return isStaff(roles) ? [names.api, names.auth, names.staff] : [names.api, names.auth];
}

// True only for exactly ["CLIENT"]; ["CLIENT", "SUPER_ADMIN"] is not a client.
export function isClientOnly(roles: unknown): boolean {
  return Array.isArray(roles) && roles.length === 1 && roles[0] === CLIENT_ROLE;
}

// Must this account prove MFA before getting a session?
// Yes if it opted in, or is anything but a plain CLIENT.
// (An enrolled authenticator also requires MFA; callers check that, it needs a DB read.)
export function requiresMfa(account: { roles: unknown; mfaRequired?: boolean | null }): boolean {
  return !!account.mfaRequired || !isClientOnly(account.roles);
}

// Does this token carry the MFA proof its account needs?
// 1. amr must contain "pwd".
// 2. amr containing "mfa" passes for any role.
// 3. Otherwise only a plain CLIENT with mfa_required === false passes (a missing claim fails).
export function hasRequiredMfaProof(claims: { amr?: unknown; roles?: unknown; mfa_required?: unknown }): boolean {
  const methods = Array.isArray(claims.amr) ? claims.amr : [];
  if (!methods.includes('pwd')) return false;
  if (methods.includes('mfa')) return true;
  return isClientOnly(claims.roles) && claims.mfa_required === false;
}
