import type { ReactNode } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import type { AccountRecord } from '../../../shared/types/Account';

export interface AccountStep {
  id: string;
  title: string;
  /** What the user should do to get past this step. */
  hint: string;
  done: boolean;
}

export interface AccountStepperProps {
  account: AccountRecord;
  /** Optional per-step action, rendered next to the step it belongs to. */
  actionFor?: (step: AccountStep) => ReactNode;
}

/**
 * Turns the stored record into "where am I in the registration run".
 *
 * The steps are derived rather than stored: the record already carries every
 * milestone (mailbox, registeredAt, token, verifiedAt), and a second source of
 * truth is a second thing to drift. Deriving also means an account created
 * before this view existed still shows the right position.
 */
export function buildSteps(account: AccountRecord): AccountStep[] {
  const hasMailbox = account.email.length > 0;
  const submitted = account.registeredAt !== null || account.status === 'registered' || account.status === 'verified';
  const captured = account.token !== null;
  const verified = account.verifiedAt !== null || account.status === 'verified';

  return [
    {
      id: 'identity',
      title: 'Identity generated',
      hint: 'Display name, handle, password and birthday are ready.',
      done: true,
    },
    {
      id: 'mailbox',
      title: 'Mailbox reserved',
      hint: hasMailbox
        ? `${account.email} can receive the verification mail.`
        : 'No mailbox yet — generate the identity again to reserve one.',
      done: hasMailbox,
    },
    {
      id: 'submit',
      title: 'Submitted on Discord',
      hint: 'Open discord.com/register, then run Auto-fill & submit.',
      done: submitted,
    },
    {
      id: 'token',
      title: 'Session token captured',
      hint: captured
        ? `Captured ${formatWhen(account.tokenCapturedAt)}.`
        : 'Log in on the Discord tab, then press Capture token & profile.',
      done: captured,
    },
    {
      id: 'verify',
      title: 'Email verified',
      hint: verified
        ? `Verified ${formatWhen(account.verifiedAt)}.`
        : 'Read the code from Inbox, paste it into the page, then mark Verified.',
      done: verified,
    },
  ];
}

function formatWhen(timestamp: number | null): string {
  return timestamp ? new Date(timestamp).toLocaleString() : 'earlier';
}

/**
 * Checklist shown above the account detail. The first unfinished step is
 * highlighted, so the next action is always the obvious one.
 */
export function AccountStepper({ account, actionFor }: AccountStepperProps): ReactNode {
  const steps = buildSteps(account);
  const doneCount = steps.filter((step) => step.done).length;
  const nextIndex = steps.findIndex((step) => !step.done);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
          Registration progress
        </span>
        <span className="Chip Chip--muted">
          {doneCount}/{steps.length}
        </span>
      </div>

      <ol className="AutofillChecklist">
        {steps.map((step, index) => {
          const isNext = index === nextIndex;

          return (
            <li
              key={step.id}
              className={`SettingRow${step.done ? ' AutofillStep--done' : ''}`}
              style={{ alignItems: 'flex-start' }}
            >
              <span className="AutofillStepNumber" aria-hidden="true">
                {step.done ? <CheckCircle2 size={13} /> : <Circle size={10} />}
              </span>

              <span className="SettingRow__text">
                <span className="SettingRow__label">
                  {step.title}
                  {isNext ? ' · next' : ''}
                </span>
                <span className="SettingRow__description">{step.hint}</span>
              </span>

              {actionFor ? actionFor(step) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

