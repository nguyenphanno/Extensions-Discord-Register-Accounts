import type { BackgroundErrorCode } from '../shared/types/Messages';
import { API_MESSAGE_FALLBACK } from './ApiEndpoints';

export interface ApiErrorInit {
  code: BackgroundErrorCode;
  message: string;
  httpStatus: number | null;
  responseCode: number | null;
  path: string;
  retryAfterSeconds: number | null;
  cause?: unknown;
}

/**
 * Every failure raised by the API layer is one of these, so callers can switch
 * on `code` instead of re-parsing strings.
 */
export class ApiError extends Error {
  readonly code: BackgroundErrorCode;
  readonly httpStatus: number | null;
  readonly responseCode: number | null;
  readonly path: string;
  readonly retryAfterSeconds: number | null;
  override readonly cause?: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.responseCode = init.responseCode;
    this.path = init.path;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.cause = init.cause;
  }

  /** True when retrying the identical request could plausibly succeed. */
  get isRetryable(): boolean {
    return (
      this.code === 'network' ||
      this.code === 'rateLimited' ||
      (this.httpStatus !== null && this.httpStatus >= 500)
    );
  }

  get isRateLimit(): boolean {
    return this.code === 'rateLimited';
  }

  /** User-facing one-liner used by toasts. */
  get friendlyMessage(): string {
    switch (this.code) {
      case 'rateLimited':
        return this.retryAfterSeconds
          ? `Mailbox service is rate limiting. Retrying in ${this.retryAfterSeconds}s.`
          : 'Mailbox service is rate limiting. Slow down and try again.';
      case 'unauthorized':
        return 'Mailbox rejected those credentials. The password may have been rotated.';
      case 'notFound':
        return 'That mailbox or message no longer exists on the server.';
      case 'conflict':
        return 'That mailbox address is already taken. Generate a new one.';
      case 'validation':
        return this.message || 'The mailbox service rejected the request payload.';
      case 'network':
        return 'Could not reach the mailbox service. Check your connection.';
      default:
        return this.message || API_MESSAGE_FALLBACK;
    }
  }
}

/** Maps an HTTP status or documented `response_code` onto our error taxonomy. */
export function mapStatusToErrorCode(status: number): BackgroundErrorCode {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'network';
  return 'internal';
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Coerces any thrown value into an ApiError without losing the original. */
export function toApiError(value: unknown, path: string): ApiError {
  if (isApiError(value)) return value;
  return new ApiError({
    code: 'internal',
    message: value instanceof Error ? value.message : String(value),
    httpStatus: null,
    responseCode: null,
    path,
    retryAfterSeconds: null,
    cause: value,
  });
}
