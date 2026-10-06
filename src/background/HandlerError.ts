import type { BackgroundErrorCode } from '../shared/types/Messages';

/**
 * Thrown by handlers to produce a structured error response.
 * Anything else escaping a handler is reported as `internal`, so handlers only
 * need to reach for this when the *code* matters to the UI.
 */
export class HandlerError extends Error {
  readonly code: BackgroundErrorCode;
  readonly fields: Record<string, string> | undefined;

  constructor(code: BackgroundErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'HandlerError';
    this.code = code;
    this.fields = fields;
  }

  static validation(message: string, fields?: Record<string, string>): HandlerError {
    return new HandlerError('validation', message, fields);
  }

  static notFound(message: string): HandlerError {
    return new HandlerError('notFound', message);
  }

  static unsupported(message: string): HandlerError {
    return new HandlerError('unsupported', message);
  }
}

/** Requires a non-empty trimmed string; returns it narrowed. */
export function requireString(
  value: unknown,
  field: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw HandlerError.validation(`"${field}" is required.`, { [field]: 'Required' });
  }

  const trimmed = value.trim();
  const min = options.minLength ?? 1;
  const max = options.maxLength ?? 512;

  if (trimmed.length < min) {
    throw HandlerError.validation(`"${field}" must be at least ${min} characters.`, {
      [field]: `Minimum ${min} characters`,
    });
  }

  if (trimmed.length > max) {
    throw HandlerError.validation(`"${field}" must be at most ${max} characters.`, {
      [field]: `Maximum ${max} characters`,
    });
  }

  return trimmed;
}

/** Requires a finite integer inside an inclusive range. */
export function requireInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const numeric = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    throw HandlerError.validation(`"${field}" must be a number.`, { [field]: 'Not a number' });
  }

  const rounded = Math.round(numeric);
  if (rounded < min || rounded > max) {
    throw HandlerError.validation(`"${field}" must be between ${min} and ${max}.`, {
      [field]: `Range ${min}-${max}`,
    });
  }

  return rounded;
}
