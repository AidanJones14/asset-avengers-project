/** Staff MFA proof has a fixed eight-hour lifetime; refresh never restarts it. */
export const STAFF_MFA_WINDOW_MS = 8 * 60 * 60 * 1000;
// Who counts as staff: isStaff in access-policy.ts (STAFF_ROLES, SUPER_ADMIN included).
