import type { AutofillPayload } from '../shared/types/Messages';
import {
  describeField,
  payloadValue,
  resolveAssignments,
  scorePageFields,
  type SemanticField,
} from './FieldMatcher';

export interface ApplyResult {
  filled: number;
  matched: string[];
}

/**
 * Writes values into a page's form fields.
 *
 * The critical detail is *how* values are written. Frameworks such as React
 * (which Discord's signup uses) ignore a plain `element.value = x` assignment
 * because they track the previous value on the node itself. We therefore go
 * through the native value setter and then dispatch `input` and `change`
 * events, which is what makes the framework's state update and the submit
 * button enable.
 */
export function applyAutofill(payload: AutofillPayload): ApplyResult {
  const assignments = resolveAssignments(scorePageFields());
  const matched: string[] = [];
  let filled = 0;

  for (const [field, candidate] of assignments) {
    const value = payloadValue(payload, field);
    if (!value) continue;

    try {
      if (writeValue(candidate.element, value, field)) {
        filled += 1;
        matched.push(describeField(field));
      }
    } catch {
      // A single hostile field must not abort the whole run.
    }
  }

  // If birthday field was not matched but payload has birthday, try 3-select DOB
  if (!assignments.has('birthday') && payload.birthday) {
    try {
      if (fillBirthdaySelects(payload.birthday)) {
        filled += 3;
        matched.push('Birthday (3 selects)');
      }
    } catch {
      // Fallback failed silently
    }
  }

  return { filled, matched: [...new Set(matched)] };
}

function writeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  field: SemanticField,
): boolean {
  if (element instanceof HTMLSelectElement) {
    return writeSelect(element, value);
  }

  if (element instanceof HTMLInputElement && element.type === 'date') {
    return writeDateInput(element, value);
  }

  return writeTextLike(element, value, field);
}

/**
 * Assigns through the prototype's setter so framework value trackers observe
 * the change, then fires the event sequence a real user would produce.
 */
function writeTextLike(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  field: SemanticField,
): boolean {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  element.focus();

  if (setter) setter.call(element, value);
  else element.value = value;

  // Reset React's internal _valueTracker so it detects the new value
  const tracker = (element as any)._valueTracker;
  if (tracker) tracker.setValue('');

  dispatch(element, 'keydown');
  dispatch(element, 'input');
  dispatch(element, 'keyup');
  dispatch(element, 'change');

  // Blurring lets the page run its validation and clear any "required" state.
  if (field !== 'password') element.blur();

  return element.value === value;
}

/** `<input type="date">` only accepts `YYYY-MM-DD`, which is already our format. */
function writeDateInput(element: HTMLInputElement, value: string): boolean {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  if (setter) setter.call(element, normalized);
  else element.value = normalized;

  dispatch(element, 'input');
  dispatch(element, 'change');

  return element.value === normalized;
}

/**
 * Selects the option matching the value, falling back to a text match.
 * Discord uses separate month/day/year selects, so matching on the raw value or
 * the visible label is what actually works.
 */
function writeSelect(element: HTMLSelectElement, value: string): boolean {
  const target = value.trim().toLowerCase();

  const option = [...element.options].find(
    (candidate) =>
      candidate.value.toLowerCase() === target ||
      candidate.textContent?.trim().toLowerCase() === target ||
      candidate.value === value,
  );

  if (!option) return false;

  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(element, option.value);
  else element.value = option.value;

  // Reset React's _valueTracker for select elements
  const tracker = (element as any)._valueTracker;
  if (tracker) tracker.setValue('');

  dispatch(element, 'input');
  dispatch(element, 'change');

  return element.value === option.value;
}

/**
 * Dispatches a bubbling, composed event.
 * `composed: true` matters for the shadow DOM, and `bubbles: true` matters for
 * React's delegated listeners on the document root.
 */
function dispatch(element: Element, type: string): void {
  const event =
    type === 'keydown' || type === 'keyup'
      ? new KeyboardEvent(type, { bubbles: true, composed: true, cancelable: true })
      : new Event(type, { bubbles: true, composed: true });

  element.dispatchEvent(event);
}

/**
 * Writes a verification code into the page.
 *
 * Kept separate from {@link applyAutofill} on purpose: the code arrives minutes
 * after the signup fields, on a different screen, and a broad match pass would
 * happily write it into an unrelated field.
 */
export function applyVerificationCode(code: string): ApplyResult {
  const assignment = resolveAssignments(scorePageFields()).get('code');

  if (!assignment) return { filled: 0, matched: [] };

  try {
    const written = writeValue(assignment.element, code, 'code');
    return { filled: written ? 1 : 0, matched: written ? [describeField('code')] : [] };
  } catch {
    return { filled: 0, matched: [] };
  }
}

/** True when at least one field on the page looks like a signup form. */
export function detectSignupForm(): boolean {
  return resolveAssignments(scorePageFields()).size >= 2;
}

/** True when the page is currently asking for a verification code. */
export function detectCodeField(): boolean {
  return resolveAssignments(scorePageFields()).has('code');
}

/**
 * Fills Discord's 3-select birthday fields (Month, Day, Year) synchronously.
 * Returns true if all 3 selects were found and filled.
 */
export function fillBirthdaySelects(birthday: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!match) return false;

  const year = match[1];
  const month = match[2];
  const day = match[3];
  if (!year || !month || !day) return false;

  const selects = Array.from(document.querySelectorAll('select')).filter((el) => {
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.getAttribute('id') || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const combined = `${name} ${id} ${aria}`;
    return (
      combined.includes('birth') ||
      combined.includes('month') ||
      combined.includes('day') ||
      combined.includes('year')
    );
  });

  if (selects.length < 3) return false;

  let monthSelect: HTMLSelectElement | null = null;
  let daySelect: HTMLSelectElement | null = null;
  let yearSelect: HTMLSelectElement | null = null;

  for (const sel of selects) {
    const attr = `${sel.name || ''} ${sel.id || ''} ${sel.getAttribute('aria-label') || ''}`.toLowerCase();
    if (attr.includes('month') && !monthSelect) monthSelect = sel;
    else if (attr.includes('day') && !daySelect) daySelect = sel;
    else if (attr.includes('year') && !yearSelect) yearSelect = sel;
  }

  if (!monthSelect || !daySelect || !yearSelect) return false;

  const monthInt = parseInt(month, 10);
  const dayInt = parseInt(day, 10);

  const setNative = (el: HTMLSelectElement, val: string): boolean => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(el, val);
    else el.value = val;

    const tracker = (el as any)._valueTracker;
    if (tracker) tracker.setValue('');

    dispatch(el, 'input');
    dispatch(el, 'change');
    return el.value === val;
  };

  let filled = 0;

  // Month: try value=month or text match
  const monthOpt = [...monthSelect.options].find(
    (opt) =>
      opt.value === String(monthInt) ||
      opt.textContent?.trim().toLowerCase().startsWith(new Date(2000, monthInt - 1, 1).toLocaleString('en', { month: 'long' }).toLowerCase()),
  );
  if (monthOpt && setNative(monthSelect, monthOpt.value)) filled++;

  // Day: try value=day or text match
  const dayOpt = [...daySelect.options].find(
    (opt) => opt.value === String(dayInt) || opt.textContent?.trim() === String(dayInt),
  );
  if (dayOpt && setNative(daySelect, dayOpt.value)) filled++;

  // Year: try value=year or text match
  const yearOpt = [...yearSelect.options].find(
    (opt) => opt.value === year || opt.textContent?.trim() === year,
  );
  if (yearOpt && setNative(yearSelect, yearOpt.value)) filled++;

  return filled === 3;
}
