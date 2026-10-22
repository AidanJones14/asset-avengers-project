/** Staff MFA proof has a fixed eight-hour lifetime; refresh never restarts it. */
export const STAFF_MFA_WINDOW_MS = 8 * 60 * 60 * 1000;
export function isStaff(roles: string[]): boolean {
  return roles.some(role => role === 'ADMIN' || role === 'ANALYST');
}
