import type { TempMailMessage } from '../shared/types/Mail';

/**
 * Wire types. These mirror the published API documentation one-to-one so a
 * backend change is a single-file edit rather than a codebase-wide hunt.
 */

export interface ApiEnvelope<TData> {
  response_code: number;
  message?: string;
  data?: TData;
}

export interface DomainsPayload {
  domains: string[];
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
}

export interface RandomEmailPayload {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginPayload {
  emails: TempMailMessage[];
}

export interface ChangePasswordRequest {
  email: string;
  current_password: string;
  new_password: string;
}

export interface ChangePasswordPayload {
  email: string;
}

export interface EmailGetRequest {
  email: string;
  password: string;
}

export interface EmailGetPayload {
  emails: TempMailMessage[];
}

export interface EmailViewRequest {
  email: string;
  password: string;
  message_id: string;
}

export interface EmailViewPayload {
  email: TempMailMessage;
}
