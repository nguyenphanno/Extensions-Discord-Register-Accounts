import { beforeEach, describe, expect, it } from 'vitest';
import {
  describeField,
  payloadValue,
  resolveAssignments,
  scorePageFields,
  type SemanticField,
} from '../src/content/FieldMatcher';

/** Renders a signup form shaped like Discord's, then returns the assignments. */
function matchForm(html: string): Map<SemanticField, { element: Element; score: number }> {
  document.body.innerHTML = html;
  return resolveAssignments(scorePageFields());
}

const DISCORD_SIGNUP = `
  <form>
    <input name="global_name" type="text" />
    <input name="username" type="text" />
    <input name="email" type="email" />
    <input name="password" type="password" />
  </form>
`;

describe('scorePageFields', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('maps each Discord signup input to its own field', () => {
    const assignments = matchForm(DISCORD_SIGNUP);

    expect([...assignments.keys()].sort()).toEqual(
      ['displayName', 'email', 'password', 'username'].sort(),
    );
  });

  // This is the regression that kept Display Name empty: the haystack is
  // normalised, so `global_name` arrives as `global-name` and only scores when
  // that spelling is in the rule's positives.
  it('recognises global_name as the display name, not the username', () => {
    const assignments = matchForm(DISCORD_SIGNUP);
    const element = assignments.get('displayName')?.element as HTMLInputElement | undefined;

    expect(element?.getAttribute('name')).toBe('global_name');
  });

  it('gives the username slot to the real username field', () => {
    const assignments = matchForm(DISCORD_SIGNUP);
    const element = assignments.get('username')?.element as HTMLInputElement | undefined;

    expect(element?.getAttribute('name')).toBe('username');
  });

  it('matches a verification code field ahead of the signup fields', () => {
    const assignments = matchForm(`
      <input name="username" type="text" />
      <input name="code" type="text" />
    `);

    expect(assignments.get('code')?.element.getAttribute('name')).toBe('code');
    expect(assignments.get('username')?.element.getAttribute('name')).toBe('username');
  });

  it('reads the field name from an associated label', () => {
    const assignments = matchForm(`
      <label for="mail">Your email address</label>
      <input id="mail" type="text" />
    `);

    expect(assignments.get('email')?.element.getAttribute('id')).toBe('mail');
  });

  it('ignores hidden, disabled and honeypot inputs', () => {
    const assignments = matchForm(`
      <input name="email" type="email" hidden />
      <input name="username" type="text" disabled />
      <div aria-hidden="true"><input name="password" type="password" /></div>
    `);

    expect(assignments.size).toBe(0);
  });

  it('never lets the password rule claim a confirm-password field', () => {
    const assignments = matchForm(`
      <input name="password" type="password" />
      <input name="confirm_password" type="password" />
    `);

    const confirmFields = [...assignments.values()].filter(
      (entry) => entry.element.getAttribute('name') === 'confirm_password',
    );

    expect(confirmFields).toHaveLength(0);
  });

  it('matches a native date input as the birthday', () => {
    const assignments = matchForm('<input name="birthday" type="date" />');

    expect(assignments.get('birthday')?.element.getAttribute('name')).toBe('birthday');
  });
});

describe('describeField', () => {
  it('labels every field the checklist can report', () => {
    expect(describeField('displayName')).toBe('Display name');
    expect(describeField('code')).toBe('Verification code');
  });
});

describe('payloadValue', () => {
  const payload = {
    displayName: 'Quiet Falcon',
    email: 'user@example.com',
    password: 'DiscordPass1!',
    birthday: '2000-01-15',
    username: 'quietfalcon',
  };

  it('reads the matching field off the payload', () => {
    expect(payloadValue(payload, 'email')).toBe('user@example.com');
    expect(payloadValue(payload, 'birthday')).toBe('2000-01-15');
  });

  it('treats a missing code as empty rather than undefined', () => {
    expect(payloadValue(payload, 'code')).toBe('');
  });
});

