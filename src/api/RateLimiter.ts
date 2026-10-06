import { sleep } from '../shared/utils/Common';
import { API_RATE_LIMIT_BURST, API_RATE_LIMIT_PER_SECOND } from '../shared/constants/AppConstants';

/**
 * Token-bucket limiter with a shared "circuit breaker" pause.
 *
 * The backend advertises ~10 req/s per IP with a burst of 50. We deliberately
 * run below that so a batch generation never trips a 429 in the first place,
 * and when the server *does* send `Retry-After` we honour it globally rather
 * than letting each in-flight request hammer the door.
 */
export class TokenBucketRateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private tokens: number;
  private lastRefillAt: number;
  private pausedUntil = 0;

  constructor(tokensPerSecond: number = API_RATE_LIMIT_PER_SECOND, burst: number = API_RATE_LIMIT_BURST) {
    this.capacity = Math.max(1, burst);
    this.refillPerMs = Math.max(1, tokensPerSecond) / 1000;
    this.tokens = this.capacity;
    this.lastRefillAt = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefillAt = now;
  }

  /** Milliseconds the caller must wait before a token is available. */
  private waitTimeMs(): number {
    const now = Date.now();
    const pauseRemaining = Math.max(0, this.pausedUntil - now);
    if (this.tokens >= 1) return pauseRemaining;

    const deficit = 1 - this.tokens;
    const refillWait = Math.ceil(deficit / this.refillPerMs);
    return Math.max(pauseRemaining, refillWait);
  }

  /** Resolves once the caller is allowed to issue one request. */
  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      this.refill();
      const wait = this.waitTimeMs();

      if (wait <= 0 && this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      await sleep(Math.min(wait, 250));
    }
  }

  /** Called when the server answers 429 so every caller backs off together. */
  pauseFor(milliseconds: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + Math.max(0, milliseconds));
    this.tokens = 0;
    this.lastRefillAt = Date.now();
  }

  get isPaused(): boolean {
    return Date.now() < this.pausedUntil;
  }

  get pausedForMs(): number {
    return Math.max(0, this.pausedUntil - Date.now());
  }
}

/** One limiter per service worker lifetime, shared by every handler. */
export const apiRateLimiter = new TokenBucketRateLimiter();
