import { HttpErrorResponse } from '@angular/common/http';

/** Error body from both auth-server and Spring (RFC 9457 problem details plus `code`). */
export interface ApiError {
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: { field: string; message: string }[];
}

/**
 * A message to show the user for a failed HTTP call. Pass per-status wording for the cases the
 * calling screen knows about (e.g. 401 on login, 409 on signup); the rest are generic.
 */
export function errorMessage(err: unknown, byStatus: Record<number, string> = {}): string {
  if (!(err instanceof HttpErrorResponse)) return 'Something went wrong. Please try again.';
  if (byStatus[err.status]) return byStatus[err.status];

  const body = err.error as Partial<ApiError> | null;
  switch (err.status) {
    case 0:
      return "Can't reach the server. Check your connection and try again.";
    case 400:
      return body?.errors?.map((e) => e.message).join(' ') || body?.detail || 'Check the form and try again.';
    case 403:
      return "You don't have access to that.";
    case 404:
      return 'Not found.';
    case 429:
      return 'Too many attempts. Wait 15 minutes and try again.';
    default:
      return body?.detail || 'Something went wrong. Please try again.';
  }
}
