import type { AutofillPayload } from '../shared/types/Messages';

/**
 * Maps a semantic field to the DOM inputs that represent it.
 *
 * Matching is attribute-driven rather than selector-driven, because form markup
 * changes far more often than the words a form uses. Each rule is scored and
 * the highest-scoring unattended input wins, which prevents the classic
 * autofill failure where the password field steals the email value.
 */
export type SemanticField = 'displayName' | 'email' | 'password' | 'birthday' | 'username' | 'code';

export interface FieldRule {
  field: SemanticField;
  /** Substrings that, if present in an identifying attribute, score a hit. */
  positive: string[];
  /** Substrings that disqualify a candidate outright. */
  negative: string[];
  /** Input `type`s this rule may fill. */
  inputTypes: string[];
  weight: number;
}

export const FIELD_RULES: readonly FieldRule[] = [
  {
    // Ordered by weight, not by position: the code field sits alongside the
    // signup fields on the same screen and must not be confused for one.
    field: 'code',
    positive: ['code', 'otp', 'passcode', 'verification-code'],
    negative: ['country', 'zip', 'postal', 'invite', 'coupon', 'promo'],
    inputTypes: ['text', 'tel', 'number'],
    weight: 12,
  },
  {
    field: 'email',
    positive: ['email', 'e-mail', 'mailaddress', 'mail'],
    negative: ['confirm', 'verify', 'repeat', 'username'],
    inputTypes: ['email', 'text'],
    weight: 10,
  },
  {
    field: 'username',
    positive: ['username', 'user-name', 'handle', 'nickname', 'displayname', 'display-name', 'name'],
    negative: ['firstname', 'lastname', 'surname', 'fullname', 'birth', 'company'],
    inputTypes: ['text'],
    weight: 8,
  },
  {
    field: 'displayName',
    positive: ['displayname', 'display-name', 'fullname', 'full-name', 'realname', 'globalname', 'global-name'],
    negative: ['username', 'handle'],
    inputTypes: ['text'],
    weight: 7,
  },
  {
    field: 'birthday',
    positive: ['birthday', 'birthdate', 'birth-date', 'dob', 'dateofbirth', 'date-of-birth'],
    negative: [],
    inputTypes: ['date', 'text'],
    weight: 9,
  },
  {
    field: 'password',
    positive: ['password', 'passwd', 'pwd', 'pass'],
    negative: ['confirm', 'verify', 'repeat', 'current', 'old'],
    inputTypes: ['password', 'text'],
    weight: 10,
  },
];

/** Attribute names scanned, in descending order of reliability. */
const IDENTIFYING_ATTRIBUTES = [
  'name',
  'id',
  'autocomplete',
  'placeholder',
  'aria-label',
  'data-testid',
  'data-test',
  'data-qa',
  'type',
  'title',
  'formcontrolname',
];

export interface FieldCandidate {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  field: SemanticField;
  score: number;
}

/** Returns every fillable element on the page with its best-matching field. */
export function scorePageFields(root: ParentNode = document): FieldCandidate[] {
  const elements = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, textarea, select',
  );

  const candidates: FieldCandidate[] = [];

  for (const element of elements) {
    if (!isFillable(element)) continue;

    const best = bestFieldFor(element);
    if (best) candidates.push({ element, field: best.field, score: best.score });
  }

  return candidates;
}

/** Assigns each semantic field at most one element, best score first. */
export function resolveAssignments(
  candidates: readonly FieldCandidate[],
): Map<SemanticField, FieldCandidate> {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const assigned = new Map<SemanticField, FieldCandidate>();

  for (const candidate of sorted) {
    if (assigned.has(candidate.field)) continue;
    assigned.set(candidate.field, candidate);
  }

  return assigned;
}

/** Human-readable label for the checklist shown after an autofill run. */
export function describeField(field: SemanticField): string {
  const labels: Record<SemanticField, string> = {
    displayName: 'Display name',
    email: 'Email',
    password: 'Password',
    birthday: 'Date of birth',
    username: 'Username',
    code: 'Verification code',
  };
  return labels[field];
}

export function payloadValue(payload: AutofillPayload, field: SemanticField): string {
  switch (field) {
    case 'displayName':
      return payload.displayName;
    case 'email':
      return payload.email;
    case 'password':
      return payload.password;
    case 'birthday':
      return payload.birthday;
    case 'username':
      return payload.username;
    case 'code':
      return payload.code ?? '';
    default: {
      const unreachable: never = field;
      return String(unreachable);
    }
  }
}
function bestFieldFor(element: Element): { field: SemanticField; score: number } | null {
  const haystack = buildHaystack(element);
  if (!haystack) return null;

  const inputType = (element.getAttribute('type') ?? 'text').toLowerCase();
  let best: { field: SemanticField; score: number } | null = null;

  for (const rule of FIELD_RULES) {
    if (!rule.inputTypes.includes(inputType)) continue;
    if (rule.negative.some((token) => haystack.includes(token))) continue;

    // A prefix hit is worth more than a substring hit: `email` in `email-input`
    // is a stronger signal than `mail` inside `mailinglist-optin`.
    const hit = rule.positive.reduce(
      (sum, token) => (haystack.includes(token) ? sum + (haystack.startsWith(token) ? 2 : 1) : sum),
      0,
    );

    if (hit === 0) continue;

    const score = hit * rule.weight;
    if (!best || score > best.score) best = { field: rule.field, score };
  }

  return best;
}

/** Concatenates every identifying attribute into one searchable string. */
function buildHaystack(element: Element): string {
  const parts: string[] = [];

  for (const attribute of IDENTIFYING_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) parts.push(value);
  }

  const label = findAssociatedLabelText(element);
  if (label) parts.push(label);

  return parts.join(' ').toLowerCase().replace(/[\s_]+/g, '-');
}

/** Resolves `<label for>` and wrapping labels, which many forms rely on. */
function findAssociatedLabelText(element: Element): string {
  const id = element.getAttribute('id');
  if (id) {
    const label = element.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) return label.textContent;
  }

  const wrapping = element.closest('label');
  return wrapping?.textContent ?? '';
}

/**
 * Rejects anything the user should not have written into automatically:
 * hidden inputs, read-only fields, disabled controls, buttons, and honeypots.
 */
function isFillable(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase();
    const excluded = [
      'hidden', 'submit', 'button', 'reset', 'image',
      'file', 'checkbox', 'radio', 'color', 'range',
    ];
    if (excluded.includes(type)) return false;
  }

  if (element.disabled) return false;
  if (!(element instanceof HTMLSelectElement) && element.readOnly) return false;
  if (element.closest('[aria-hidden="true"]')) return false;

  // Off-screen honeypots are invisible to the user but trivially detectable here.
  const view = element.ownerDocument?.defaultView;
  const style = view?.getComputedStyle(element);
  if (style?.display === 'none' || style?.visibility === 'hidden') return false;

  return true;
}

