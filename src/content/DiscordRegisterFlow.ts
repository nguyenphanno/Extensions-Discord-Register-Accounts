/**
 * Discord registration flow engine.
 *
 * Owns the multi-step sequence the user asks for with one click: clearing the
 * DOB/ToS pre-screens, writing every field, ticking the agreement checkboxes,
 * submitting, then capturing the session token and handing it to the worker.
 *
 * Every step re-checks the page before acting and retries a few times, because
 * React re-renders between screens and a selector that matched a moment ago may
 * already be gone. Progress is reported through the in-page toast overlay.
 */

import type { AutofillPayload } from '../shared/types/Messages';
import { getToken } from './TokenCapture';
import { showToast } from './ToastOverlay';

// ============================================================================
// Page helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the element currently occupies space and is not transparent. */
function visibleNow(element: Element | null): boolean {
  if (!element) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function normTxt(element: Element | null): string {
  return (element?.textContent ?? '').trim().toLowerCase();
}

function findByAny(selector: string): Element | null {
  return document.querySelector(selector);
}

/** The identifying text of a control, used to label unknown dropdowns. */
function controlLabel(element: Element): string {
  return [
    element.getAttribute('aria-label'),
    element.getAttribute('name'),
    element.getAttribute('placeholder'),
    element.getAttribute('id'),
    element.getAttribute('data-testid'),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLowerCase();
}

/**
 * Writes a value the way React expects to see it.
 *
 * A plain `element.value = x` is invisible to React's value tracker, so the
 * native setter is used, the tracker is reset, and the event trio a real user
 * would produce is dispatched.
 */
function setVal(element: HTMLInputElement | HTMLSelectElement, value: string): boolean {
  const prototype =
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (setter) setter.call(element, value);
  else element.value = value;

  // React stashes the last value it saw on the node; clearing it makes the
  // next `input` event register as a real edit rather than a no-op.
  const tracker = (element as unknown as { _valueTracker?: { setValue(v: string): void } })
    ._valueTracker;
  tracker?.setValue('');

  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));

  return element.value === value;
}

/** Clicks an element the way a pointer would, so React's onClick fires. */
function fireClick(element: Element): void {
  if (element instanceof HTMLElement) element.click();
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}


// ============================================================================
// Field filling
// ============================================================================

/** Fills one text input, retrying while the next screen renders. */
async function fillField(selector: string, value: string, attempts = 5): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const element = findByAny(selector) as HTMLInputElement | null;

    if (element && visibleNow(element)) {
      setVal(element, value);
      await sleep(250);
      if (element.value === value) return true;
    }

    await sleep(500);
  }

  return false;
}

function fillEmail(email: string): Promise<boolean> {
  return fillField('input[name="email"], input[type="email"]', email);
}

function fillUsername(username: string): Promise<boolean> {
  return fillField('input[name="username"]', username);
}

function fillPassword(password: string): Promise<boolean> {
  return fillField('input[type="password"][name="password"], input[name="password"]', password);
}

/**
 * Display name lives in `global_name` on Discord, which the field matcher used
 * to normalise to `global-name` and therefore never score. The explicit list
 * below is tried first, with a text-match pass as the fallback.
 */
async function fillDisplayName(displayName: string): Promise<boolean> {
  const selectors = [
    'input[name="global_name"]',
    'input[name="global-name"]',
    'input[name="globalName"]',
    'input[name="displayName"]',
    'input[name="display_name"]',
  ];

  for (const selector of selectors) {
    if (await fillField(selector, displayName, 2)) return true;
  }

  // Fallback: any visible text input whose identifying text mentions display.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="text"]'),
    ).filter((element) => visibleNow(element) && controlLabel(element).includes('display'));

    for (const candidate of candidates) {
      if (setVal(candidate, displayName)) {
        await sleep(250);
        if (candidate.value === displayName) return true;
      }
    }

    await sleep(500);
  }

  return false;
}


// ============================================================================
// Date of birth: native selects, then custom dropdowns
// ============================================================================

const MONTH_FULL = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

const DOB_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DobParts {
  year: string;
  month: number;
  day: number;
  monthName: string;
}

function parseDob(birthday: string): DobParts | null {
  const match = DOB_PATTERN.exec(birthday.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  if (!year || !month || !day) return null;

  const monthNumber = Number(month);
  const monthName = MONTH_FULL[monthNumber - 1];
  if (!monthName) return null;

  return { year, month: monthNumber, day: Number(day), monthName };
}

interface DobSelects {
  month: HTMLSelectElement | null;
  day: HTMLSelectElement | null;
  year: HTMLSelectElement | null;
}

/** Sorts the page's selects into month/day/year by their identifying text. */
function classifyNativeSelects(): DobSelects {
  const result: DobSelects = { month: null, day: null, year: null };

  for (const element of document.querySelectorAll('select')) {
    if (!visibleNow(element)) continue;

    const label = controlLabel(element);
    if (label.includes('month') && !result.month) result.month = element;
    else if (label.includes('day') && !result.day) result.day = element;
    else if (label.includes('year') && !result.year) result.year = element;
  }

  return result;
}

/** Selects an option by value or visible label and verifies the write. */
function nativeSet(select: HTMLSelectElement, candidates: readonly string[]): boolean {
  for (const candidate of candidates) {
    const needle = candidate.toLowerCase();
    const option = [...select.options].find(
      (entry) =>
        entry.value.toLowerCase() === needle || (entry.textContent ?? '').trim().toLowerCase() === needle,
    );

    if (!option) continue;
    if (setVal(select, option.value)) return true;
  }

  return false;
}

async function fillDobNative(dob: DobParts): Promise<boolean> {
  const selects = classifyNativeSelects();
  if (!selects.month || !selects.day || !selects.year) return false;

  const monthOk = nativeSet(selects.month, [String(dob.month), dob.monthName]);
  await sleep(200);
  const dayOk = nativeSet(selects.day, [String(dob.day)]);
  await sleep(200);
  const yearOk = nativeSet(selects.year, [dob.year]);

  return monthOk && dayOk && yearOk;
}

// --- Custom dropdown fallback -------------------------------------------------

function pressKey(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, composed: true }));
}

/** Locates the floating panel a dropdown opened. */
function findOpenPopup(): Element | null {
  const popups = Array.from(
    document.querySelectorAll('[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]'),
  ).filter(visibleNow);

  return popups[popups.length - 1] ?? null;
}

function getOptions(popup: Element): Element[] {
  return Array.from(popup.querySelectorAll('[role="option"], li')).filter(visibleNow);
}

function findOption(options: readonly Element[], needle: string): Element | null {
  const lower = needle.toLowerCase();

  return (
    options.find((option) => {
      const text = normTxt(option);
      return text === lower || text.startsWith(lower) || (option.textContent ?? '').includes(needle);
    }) ?? null
  );
}

async function openPopup(trigger: Element): Promise<Element | null> {
  fireClick(trigger);
  await sleep(350);
  return findOpenPopup();
}

async function closePopup(): Promise<void> {
  pressKey(document.body, 'Escape');
  await sleep(200);
}

/** Finds the combobox-like control belonging to a labelled field. */
function popupField(label: string): Element | null {
  const controls = Array.from(
    document.querySelectorAll('button, div[role="combobox"], div[role="button"]'),
  ).filter(visibleNow);

  return (
    controls.find((control) => {
      const own = controlLabel(control);
      const wrapper = control.parentElement;
      const context = wrapper ? controlLabel(wrapper) : '';
      return own.includes(label) || context.includes(label);
    }) ?? null
  );
}

async function popupSelect(trigger: Element, needle: string): Promise<boolean> {
  const popup = await openPopup(trigger);
  if (!popup) return false;

  const direct = findOption(getOptions(popup), needle);
  if (direct) {
    fireClick(direct);
    await sleep(300);
    return true;
  }

  // Long lists render only what fits; step through them with the keyboard.
  for (let step = 0; step < 12; step += 1) {
    pressKey(popup, 'ArrowDown');
    await sleep(90);

    const found = findOption(getOptions(popup), needle);
    if (found) {
      fireClick(found);
      await sleep(300);
      return true;
    }
  }

  await closePopup();
  return false;
}

async function fillDobViaPopup(dob: DobParts): Promise<boolean> {
  const steps: readonly { label: string; needle: string }[] = [
    { label: 'month', needle: dob.monthName.slice(0, 3) },
    { label: 'day', needle: String(dob.day) },
    { label: 'year', needle: dob.year },
  ];

  for (const step of steps) {
    const control = popupField(step.label);
    if (!control) return false;
    if (!(await popupSelect(control, step.needle))) return false;
  }

  return true;
}

/** Native selects first, custom dropdown second, otherwise the user takes over. */
async function fillBirthday(birthday: string): Promise<'native' | 'popup' | 'manual'> {
  const dob = parseDob(birthday);
  if (!dob) return 'manual';

  if (await fillDobNative(dob)) return 'native';
  if (await fillDobViaPopup(dob)) return 'popup';

  return 'manual';
}


// ============================================================================
// Checkboxes (ToS + marketing)
// ============================================================================

const TOS_KEYWORDS = ['terms', 'service agreement', 'privacy policy', 'community guidelines'];
const MARKETING_KEYWORDS = ['marketing', 'newsletter', 'promotional', 'product updates'];

const CHECKBOX_SELECTOR =
  'input[type="checkbox"], div[role="checkbox"], span[role="checkbox"], button[role="checkbox"]';

function squaresIn(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(CHECKBOX_SELECTOR)).filter(visibleNow);
}

function isChecked(checkbox: Element): boolean {
  if (checkbox instanceof HTMLInputElement) return checkbox.checked;
  return checkbox.getAttribute('aria-checked') === 'true';
}

/** The smallest ancestor whose text still identifies which box this is. */
function rowOf(checkbox: Element): Element {
  let current: Element = checkbox;

  for (let depth = 0; depth < 6; depth += 1) {
    const parent: Element | null = current.parentElement;
    if (!parent || parent.tagName === 'BODY') return current;

    const text = normTxt(parent);
    if (text.length > 8) return parent;
    current = parent;
  }

  return current;
}

function rowIsChecked(checkbox: Element): boolean {
  return isChecked(checkbox);
}

function matchesKeywords(checkbox: Element, keywords: readonly string[]): boolean {
  const row = normTxt(rowOf(checkbox));
  return keywords.some((keyword) => row.includes(keyword));
}

function narrowTo(squares: readonly Element[], keywords: readonly string[]): Element[] {
  return squares.filter((square) => matchesKeywords(square, keywords));
}

function collectCheckRows(): { tos: Element[]; marketing: Element[] } {
  const all = squaresIn(document.body);
  return { tos: narrowTo(all, TOS_KEYWORDS), marketing: narrowTo(all, MARKETING_KEYWORDS) };
}

/** The clickable surface: real inputs are clicked, custom ones their label. */
function pointerTarget(checkbox: Element): Element {
  if (checkbox instanceof HTMLInputElement) return checkbox;
  return checkbox.closest('label') ?? checkbox;
}

function safeOuter(element: Element): Element {
  let current = element;

  for (let depth = 0; depth < 3; depth += 1) {
    const parent: Element | null = current.parentElement;
    if (!parent || parent.tagName === 'BODY') return current;
    current = parent;
  }

  return current;
}

/**
 * Ticks one box, escalating from the tightest target to the widest.
 * Discord wraps the input in a styled span, so clicking only the input can
 * silently do nothing.
 */
async function tickOne(checkbox: Element): Promise<void> {
  if (rowIsChecked(checkbox)) return;

  fireClick(pointerTarget(checkbox));
  await sleep(220);
  if (rowIsChecked(checkbox)) return;

  fireClick(safeOuter(pointerTarget(checkbox)));
  await sleep(220);
  if (rowIsChecked(checkbox)) return;

  pressKey(pointerTarget(checkbox), ' ');
  await sleep(200);
}

/** Ticks every unticked ToS and marketing box currently on screen. */
async function tickRegisterChecks(): Promise<number> {
  const { tos, marketing } = collectCheckRows();
  let ticked = 0;

  for (const checkbox of [...tos, ...marketing]) {
    if (rowIsChecked(checkbox)) continue;
    await tickOne(checkbox);
    if (rowIsChecked(checkbox)) ticked += 1;
  }

  return ticked;
}

/** Single-shot tick used when a new screen appears after submitting. */
function tickCheckbox(checkbox: Element): boolean {
  if (rowIsChecked(checkbox)) return false;
  fireClick(pointerTarget(checkbox));
  return rowIsChecked(checkbox);
}

// ============================================================================
// Submission
// ============================================================================

const SUBMIT_WORDS = ['continue', 'next', 'submit', 'create account', 'create', 'finish'];

function submitForm(): boolean {
  const buttons = Array.from(document.querySelectorAll('button')).filter(visibleNow);

  for (const button of buttons) {
    if (button.disabled) continue;
    const text = normTxt(button);
    if (SUBMIT_WORDS.some((word) => text.includes(word))) {
      fireClick(button);
      return true;
    }
  }

  const form = document.querySelector('form');
  if (!form) return false;

  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return true;
}

/** True once the account screen is on screen, which is where the flow starts. */
function onSignupScreen(): boolean {
  const emailInput = findByAny('input[name="email"], input[type="email"]');
  return Boolean(emailInput && visibleNow(emailInput));
}


// ============================================================================
// Orchestration
// ============================================================================

/**
 * Clears Discord's age + agreement pre-screens.
 *
 * The email field the user sees is the *second* screen: Discord asks for a
 * birthday and the ToS checkbox first. Each pass fills what it can find, ticks
 * what is unticked, and presses the forward button, stopping as soon as the
 * email field appears.
 */
async function handlePreScreens(payload: AutofillPayload): Promise<void> {
  for (let pass = 0; pass < 8; pass += 1) {
    if (onSignupScreen()) return;

    await sleep(600);

    const dobOutcome = await fillBirthday(payload.birthday);
    if (dobOutcome === 'native') {
      showToast('Pre-screen: date of birth', 'Filled the three dropdowns.', 'info');
    } else if (dobOutcome === 'manual') {
      showToast('Set the date of birth', payload.birthday, 'warning');
      await sleep(4000);
    }

    const ticked = await tickRegisterChecks();
    if (ticked > 0) {
      showToast('Pre-screen: agreement', `Ticked ${ticked} checkbox${ticked === 1 ? '' : 'es'}.`, 'info');
    }

    if (!submitForm()) return;
    await sleep(1400);

    if (onSignupScreen()) return;
  }
}

/** Discord can add another agreement screen after submit; keep it tidy. */
async function watchChecksAfterSubmit(): Promise<void> {
  for (let pass = 0; pass < 4; pass += 1) {
    await sleep(1200);

    const { tos, marketing } = collectCheckRows();
    for (const checkbox of [...tos, ...marketing]) {
      if (tickCheckbox(checkbox)) {
        showToast('Agreement ticked', 'Continued.', 'info');
        await sleep(600);
      }
    }
  }
}

interface FlowResult {
  submitted: boolean;
  token: string | null;
}

/**
 * Runs the whole sequence and hands any captured token to the worker, which
 * fetches the Discord profile and stores both on the vault record.
 */
async function executeFlow(payload: AutofillPayload): Promise<FlowResult> {
  showToast('Registration started', 'Clearing the pre-screens…', 'info');
  await handlePreScreens(payload);

  showToast('Filling email', payload.email, 'info');
  if (!(await fillEmail(payload.email))) return { submitted: false, token: null };

  showToast('Filling username', payload.username, 'info');
  await fillUsername(payload.username);

  showToast('Filling password', '••••••••', 'info');
  if (!(await fillPassword(payload.password))) return { submitted: false, token: null };

  showToast('Filling display name', payload.displayName, 'info');
  if (!(await fillDisplayName(payload.displayName))) {
    showToast('Display name not found', 'Skipped — fill it on the page.', 'warning');
  }

  showToast('Filling date of birth', payload.birthday, 'info');
  const dobOutcome = await fillBirthday(payload.birthday);
  if (dobOutcome === 'manual') {
    showToast('Set the date of birth', `${payload.birthday} — fill it on the page.`, 'warning');
    return { submitted: false, token: null };
  }

  showToast('Ticking agreements', 'Terms of service…', 'info');
  await tickRegisterChecks();

  showToast('Submitting', 'Creating the account…', 'info');
  if (!submitForm()) {
    showToast('Submit button not found', 'Press it on the page.', 'warning');
    return { submitted: false, token: null };
  }

  void watchChecksAfterSubmit();
  return { submitted: true, token: await waitForToken() };
}

/** Polls localStorage for the token Discord issues after signup. */
async function waitForToken(attempts = 30): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = getToken();
    if (token) return token;
    await sleep(2000);
  }

  return null;
}

/** Sends the captured token to the worker, which owns the vault. */
async function saveToken(email: string, token: string): Promise<boolean> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'vault/saveToken',
      email,
      token,
    })) as { ok?: boolean } | undefined;

    return response?.ok === true;
  } catch {
    return false;
  }
}

/**
 * Entry point called by the content script after it acknowledges the message,
 * so the message channel is never held open for the length of the flow.
 */
export async function runRegisterFlow(payload: AutofillPayload): Promise<void> {
  try {
    const { submitted, token } = await executeFlow(payload);

    if (!submitted) {
      showToast('Flow stopped', 'Finish the highlighted step on the page.', 'warning');
      return;
    }

    if (!token) {
      showToast('Submitted', 'No token yet — capture it from the vault later.', 'warning');
      return;
    }

    const saved = await saveToken(payload.email, token);

    if (saved) {
      showToast('Registered', 'Token captured and profile saved to the vault.', 'success');
    } else {
      showToast('Token captured', 'No vault record matched — save it from the vault.', 'warning');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The registration flow failed.';
    showToast('Flow failed', message, 'warning');
  }
}

