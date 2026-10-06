import { hash32 } from '../shared/utils/Common';
import type { AvatarDescriptor } from './IdentityProfile';

/**
 * Discord-style letter avatars.
 *
 * Discord's own default avatars are a solid brand colour with the member's
 * initials, so we reproduce that language instead of inventing clip-art.
 * Nothing here renders a bitmap: the descriptor is pure data and the React
 * layer turns it into a CSS gradient circle.
 */
const GRADIENT_PAIRS: readonly [string, string][] = [
  ['#5865F2', '#7C5CFC'],
  ['#57F287', '#1ABC9C'],
  ['#FEE75C', '#F0B232'],
  ['#EB459E', '#C13584'],
  ['#ED4245', '#B02A2E'],
  ['#3BA55D', '#248046'],
  ['#00A8FC', '#0F7FBF'],
  ['#FAA61A', '#E67E22'],
  ['#9B59B6', '#6C3483'],
  ['#1ABC9C', '#148F77'],
];

const ANGLE_STEPS = [35, 65, 95, 125, 155, 200, 245, 290];

/**
 * Derives a stable avatar from a seed.
 * The same account always paints the same avatar across sessions and devices
 * because the derivation is a pure function of the seed string.
 */
export function describeAvatar(seed: string, label: string): AvatarDescriptor {
  const seedHash = hash32(seed);
  const labelHash = hash32(label);

  const pair = GRADIENT_PAIRS[seedHash % GRADIENT_PAIRS.length] ?? GRADIENT_PAIRS[0]!;
  const angle = ANGLE_STEPS[seedHash % ANGLE_STEPS.length] ?? ANGLE_STEPS[0]!;

  return {
    initials: extractInitials(label, labelHash),
    gradientFrom: pair[0],
    gradientTo: pair[1],
    angle,
  };
}

/**
 * Picks up to two initials from a label.
 * Handles the three shapes our generator produces: `SwiftFalcon` (camel),
 * `alex hartley` (spaced) and `Swift.Falcon` (dotted handle).
 */
export function extractInitials(label: string, salt = 0): string {
  const cleaned = label.replace(/[^\p{L}\p{N}\s._-]/gu, ' ').trim();
  if (!cleaned) return '?';

  const words = cleaned
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) return '?';

  if (words.length === 1) {
    const single = words[0] as string;
    const take = single.length >= 2 ? 2 : 1;
    const offset = salt % Math.max(1, single.length - take + 1);
    return single.slice(offset, offset + take).toUpperCase();
  }

  const first = (words[0] as string).charAt(0);
  const second = (words[1] as string).charAt(0);
  const initials = `${first}${second}`.toUpperCase();

  return initials.length > 0 ? initials : '?';
}

/** CSS-ready string; kept beside the descriptor so the two never diverge. */
export function avatarBackground(descriptor: AvatarDescriptor): string {
  return `linear-gradient(${descriptor.angle}deg, ${descriptor.gradientFrom} 0%, ${descriptor.gradientTo} 100%)`;
}
