import type { BackgroundErrorCode } from '../shared/types/Messages';
import { sleep } from '../shared/utils/Common';
import { ApiResponseCode, RETRY_AFTER_HEADER } from './ApiEndpoints';
import { ApiError, mapStatusToErrorCode, toApiError } from './ApiError';
import type { ApiEnvelope } from './ApiTypes';
import { apiRateLimiter } from './RateLimiter';
import {
  API_MAX_RETRY_ATTEMPTS,
  API_REQUEST_TIMEOUT_MS,
  API_RETRY_BASE_DELAY_MS,
  API_RETRY_MAX_DELAY_MS,
} from '../shared/constants/AppConstants';

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

/**
 * Transport for the temp-mail backend.
 *
 * Responsibilities kept here (and nowhere else):
 *  - URL composition from a user-editable base URL
 *  - request timeout via AbortController
 *  - rate limiting through the shared token bucket
 *  - bounded retries with jitter for transient failures only
 *  - unwrapping the `{ response_code, message, data }` envelope
 */
export class ApiClient {
  private baseUrl: string;
  private timeoutMs: number;
  private maxAttempts: number;
  private onRequest: ((path: string, status: number | null) => void) | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = ApiClient.normalizeBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? API_REQUEST_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? API_MAX_RETRY_ATTEMPTS;
  }

  static normalizeBaseUrl(raw: string): string {
    return raw.trim().replace(/\/+$/, '');
  }

  setBaseUrl(raw: string): void {
    this.baseUrl = ApiClient.normalizeBaseUrl(raw);
  }

  /** Observers notified per attempt so the audit log stays accurate. */
  setOnRequest(observer: ((path: string, status: number | null) => void) | null): void {
    this.onRequest = observer;
  }

  get origin(): string {
    return this.baseUrl;
  }

  async get<TData>(path: string): Promise<TData> {
    return this.request<TData>(path, { method: 'GET' });
  }

  async post<TData>(path: string, body: unknown): Promise<TData> {
    return this.request<TData>(path, { method: 'POST', body });
  }

  private async request<TData>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
  ): Promise<TData> {
    let lastError: ApiError | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      await apiRateLimiter.acquire();

      try {
        return await this.attemptRequest<TData>(path, init);
      } catch (error) {
        const apiError = toApiError(error, path);

        if (apiError.isRateLimit && apiError.retryAfterSeconds !== null) {
          apiRateLimiter.pauseFor(apiError.retryAfterSeconds * 1000);
        }

        lastError = apiError;

        if (attempt >= this.maxAttempts || !apiError.isRetryable) throw apiError;

        await sleep(this.backoffDelayMs(attempt));
      }
    }

    throw (
      lastError ??
      new ApiError({
        code: 'internal',
        message: `Request to ${path} failed without a diagnosable error.`,
        httpStatus: null,
        responseCode: null,
        path,
        retryAfterSeconds: null,
      })
    );
  }

  /** One transport attempt, with timeout, envelope parsing and error mapping. */
  private async attemptRequest<TData>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
  ): Promise<TData> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: init.method,
        signal: controller.signal,
        headers: init.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: init.method === 'POST' ? JSON.stringify(init.body ?? {}) : undefined,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      this.onRequest?.(path, null);

      throw new ApiError({
        code: 'network',
        message: aborted
          ? `Request to ${path} timed out after ${this.timeoutMs}ms.`
          : `Network request to ${path} failed.`,
        httpStatus: null,
        responseCode: null,
        path,
        retryAfterSeconds: null,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }

    this.onRequest?.(path, response.status);

    const payload = await this.readJson(response, path);
    const retryAfterSeconds = parseRetryAfter(response.headers.get(RETRY_AFTER_HEADER));
    const envelope = payload as ApiEnvelope<TData>;

    const responseCode =
      typeof envelope.response_code === 'number' ? envelope.response_code : null;

    const serverCode: BackgroundErrorCode | null =
      responseCode !== null && responseCode >= 400 ? mapStatusToErrorCode(responseCode) : null;

    if (!response.ok || serverCode !== null) {
      const status = !response.ok ? response.status : (responseCode ?? response.status);

      throw new ApiError({
        code: serverCode ?? mapStatusToErrorCode(response.status),
        message: envelope.message?.trim() || `Request to ${path} failed with status ${status}.`,
        httpStatus: response.status,
        responseCode,
        path,
        retryAfterSeconds,
      });
    }

    // `/register` answers 201, and a few endpoints legitimately omit `data`.
    return (envelope.data ?? (payload as TData)) as TData;
  }

  private async readJson(response: Response, path: string): Promise<unknown> {
    const raw = await response.text();
    if (!raw.trim()) return {} as ApiEnvelope<never>;

    try {
      return JSON.parse(raw) as unknown;
    } catch (error) {
      throw new ApiError({
        code: 'internal',
        message: response.ok
          ? `Malformed JSON from ${path}.`
          : `Request to ${path} failed with status ${response.status}.`,
        httpStatus: response.status,
        responseCode: ApiResponseCode.serverError,
        path,
        retryAfterSeconds: null,
        cause: error,
      });
    }
  }

  /** Exponential backoff with full jitter, capped so retries stay snappy. */
  private backoffDelayMs(attempt: number): number {
    const ceiling = Math.min(
      API_RETRY_MAX_DELAY_MS,
      API_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
    );
    return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
  }
}

/** Parses `Retry-After`, accepting both delta-seconds and HTTP-date forms. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);

  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));

  return null;
}
