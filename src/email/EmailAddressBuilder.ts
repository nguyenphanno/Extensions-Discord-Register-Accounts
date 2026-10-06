import type { ExtensionSettings } from '../shared/types/Settings';
import { splitEmailAddress } from './EmailDomainPool';

export interface AddressBuildOptions {
  localPart: string;
  domain: string;
}

export interface BuiltAddress {
  email: string;
  localPart: string;
  domain: string;
}

/** Joins a local part and domain, returning `null` for anything invalid. */
export function buildAddress(options: AddressBuildOptions): BuiltAddress | null {
  const candidate = `${options.localPart.trim().toLowerCase()}@${options.domain.trim().toLowerCase()}`;
  const parts = splitEmailAddress(candidate);
  if (!parts) return null;

  return { email: candidate, localPart: parts.localPart, domain: parts.domain };
}

/**
 * Renders the address the way the UI shows it: the domain is visually
 * de-emphasised so the user's eye lands on the part they can actually edit.
 */
export function splitForDisplay(email: string): { localPart: string; domain: string } {
  return splitEmailAddress(email) ?? { localPart: email, domain: '' };
}

/** Applies the user's remote-content preference to a sanitized body. */
export function shouldLoadRemoteContent(settings: ExtensionSettings): boolean {
  return settings.loadRemoteMailImages === true;
}

/** Anything that looks like a tracking pixel is dropped regardless of settings. */
export function isLikelyTrackingPixel(width: string | null, height: string | null): boolean {
  const w = Number.parseInt(width ?? '', 10);
  const h = Number.parseInt(height ?? '', 10);
  return (Number.isFinite(w) && w <= 2) || (Number.isFinite(h) && h <= 2);
}
