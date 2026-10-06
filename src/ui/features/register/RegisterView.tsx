import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Circle, ClipboardPaste, Globe, KeyRound, Mail, Send, Sparkles, UserPlus } from 'lucide-react';
import type { AccountRecord } from '../../../shared/types/Account';
import { makeBackgroundCall } from '../../hooks/useAsyncTask';
import { useToast } from '../../hooks/useToast';
import { Button, Chip, EmptyState } from '../../components/Primitives';
import { SectionCard } from '../../components/Fields';
import { IdentityCardView } from '../generator/IdentityCardView';

const applyCode = makeBackgroundCall((code: string) => ({ type: 'autofill/applyCode', code }) as const);

const pingTab = makeBackgroundCall(() => ({ type: 'autofill/ping' }) as const);

const applyAutofill = makeBackgroundCall((account: AccountRecord) => ({
  type: 'autofill/apply',
  payload: {
    displayName: account.discordDisplayName,
    email: account.email,
    password: account.discordPassword,
    birthday: account.birthday,
    username: account.discordUsername,
  },
}) as const);

const startFlow = makeBackgroundCall((account: AccountRecord) => ({
  type: 'autofill/flow',
  payload: {
    displayName: account.discordDisplayName,
    email: account.email,
    password: account.discordPassword,
    birthday: account.birthday,
    username: account.discordUsername,
  },
}) as const);

const captureToken = makeBackgroundCall((id: string) => ({
  type: 'vault/captureToken',
  id,
}) as const);

export interface RegisterViewProps {
  account: AccountRecord | null;
  clipboardClearSeconds: number;
  revealByDefault: boolean;
  onGenerate: () => void;
}

interface Step {
  id: string;
  title: string;
  description: string;
  done: boolean;
}

/**
 * Guided registration checklist.
 *
 * This screen deliberately stops short of submitting anything. It prepares the
 * credentials, writes them into the form the user already navigated to, and
 * hands control back. Captcha solving, form submission and any attempt to look
 * like a different device are out of scope by design - those are precisely the
 * behaviours platform anti-abuse systems exist to detect.
 */
export function RegisterView({
  account,
  clipboardClearSeconds,
  revealByDefault,
  onGenerate,
}: RegisterViewProps): ReactNode {
  const toast = useToast();
  const [tabReady, setTabReady] = useState(false);
  const [checkedTab, setCheckedTab] = useState(false);
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState(false);
  const [pastingCode, setPastingCode] = useState(false);
  const [flowing, setFlowing] = useState(false);
  const [flowStarted, setFlowStarted] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const probeTab = useCallback(async () => {
    try {
      const result = await pingTab();
      setTabReady(result.ready);
    } catch {
      setTabReady(false);
    } finally {
      setCheckedTab(true);
    }
  }, []);

  useEffect(() => {
    void probeTab();
  }, [probeTab]);

  if (!account) {
    return (
      <EmptyState
        icon={<UserPlus size={24} />}
        title="No identity selected"
        body="Generate an identity first, or pick one from the vault, to walk through the registration steps."
        action={
          <Button onClick={onGenerate} icon={<Sparkles size={15} />}>
            Generate identity
          </Button>
        }
      />
    );
  }

  const hasMailbox = account.email.length > 0;

  const steps: Step[] = [
    {
      id: 'identity',
      title: 'Identity ready',
      description: 'Display name, handle, password and date of birth are generated and unique.',
      done: true,
    },
    {
      id: 'mailbox',
      title: 'Temporary mailbox reserved',
      description: hasMailbox
        ? `${account.email} is live and ready to receive the verification message.`
        : 'No mailbox yet. Generate again to reserve one.',
      done: hasMailbox,
    },
    {
      id: 'page',
      title: 'Signup form open',
      description: tabReady
        ? 'A fillable page is reachable from here.'
        : 'Open discord.com/register in a tab, then re-check.',
      done: tabReady,
    },
    {
      id: 'fill',
      title: 'Form fields filled',
      description: filled
        ? 'The fields were written. Review them before continuing.'
        : flowStarted
          ? 'The automated flow is running on the page; watch the toast for progress.'
          : 'Fill the fields, then solve the captcha and press Create account yourself.',
      done: filled || flowStarted,
    },
  ];

  async function handleFill(): Promise<void> {
    if (!account) return;

    setFilling(true);
    try {
      const result = await applyAutofill(account);

      if (result.filled === 0) {
        toast.warn('Nothing filled', 'Open the Discord signup form first, then press Fill again.');
      } else {
        setFilled(true);
        toast.success(
          `Filled ${result.filled} field${result.filled === 1 ? '' : 's'}`,
          result.matched.join(' · '),
        );
      }
    } catch (error) {
      toast.error('Autofill failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setFilling(false);
    }
  }

  /**
   * Starts the multi-step flow on the page: pre-screens, all fields, checkboxes,
   * submission, then token capture. The page reports progress via its own toast.
   */
  async function handleFlow(): Promise<void> {
    if (!account) return;

    setFlowing(true);
    toast.progress('autofill-flow', 'Registration running', 'The page is working through every step.');
    try {
      await startFlow(account);
      setFlowStarted(true);
      setFilled(true);
      toast.success('Flow started', 'Watch the page: it fills, submits and captures the token.');
    } catch (error) {
      toast.error('Could not start the flow', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setFlowing(false);
    }
  }

  /** Captures the session token from the open tab after submitting. */
  async function handleCaptureToken(): Promise<void> {
    if (!account) return;

    setCapturing(true);
    toast.progress('token-capture', 'Capturing token', 'Reading the open Discord tab…');
    try {
      const result = await captureToken(account.id);
      if (result.fetchedProfile) {
        toast.success('Token captured', 'Discord profile saved to the vault.');
      } else {
        toast.warn('Token captured', 'Profile fetch failed; the token is stored without profile data.');
      }
    } catch (error) {
      toast.error('Capture failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setCapturing(false);
    }
  }


  async function handlePasteCode(): Promise<void> {
    if (!account?.lastVerificationCode) return;

    setPastingCode(true);
    try {
      const result = await applyCode(account.lastVerificationCode);

      if (result.filled === 0) {
        toast.warn('No code field found', 'Open the Discord verification screen, then try again.');
      } else {
        toast.success('Code pasted', 'Check the page, then submit it.');
      }
    } catch (error) {
      toast.error('Could not paste the code', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setPastingCode(false);
    }
  }

  return (
    <div className="Pane__sections">
      <SectionCard
        icon={<UserPlus size={15} />}
        title="Registration walkthrough"
        description="Fill manually, or hand the whole sequence to the automated flow."
        actions={
          <Chip tone={filled ? 'success' : 'accent'}>
            {steps.filter((step) => step.done).length}/{steps.length}
          </Chip>
        }
      >
        <ol className="AutofillChecklist">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className={`SettingRow${step.done ? ' AutofillStep--done' : ''}`}
              style={{ alignItems: 'flex-start' }}
            >
              <span className="AutofillStepNumber" aria-hidden="true">
                {step.done ? <CheckCircle2 size={13} /> : index + 1}
              </span>

              <span className="SettingRow__text">
                <span className="SettingRow__label">{step.title}</span>
                <span className="SettingRow__description">{step.description}</span>
              </span>

              {step.id === 'page' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void probeTab()}
                  icon={<Globe size={14} />}
                >
                  {checkedTab ? 'Re-check' : 'Check'}
                </Button>
              ) : null}

              {step.id === 'mailbox' && !hasMailbox ? (
                <Button variant="ghost" size="sm" onClick={onGenerate} icon={<Sparkles size={14} />}>
                  Reserve
                </Button>
              ) : null}
            </li>
          ))}
        </ol>

        <Button
          block
          loading={flowing}
          disabled={!hasMailbox}
          onClick={() => void handleFlow()}
          icon={<Send size={15} />}
        >
          Auto-fill &amp; submit
        </Button>

        <Button
          block
          variant="secondary"
          loading={filling}
          disabled={!hasMailbox}
          onClick={() => void handleFill()}
          icon={<ClipboardPaste size={15} />}
        >
          Fill only
        </Button>

        <p className="Field__hint" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <ClipboardPaste size={13} style={{ marginTop: 2, flex: 'none' }} aria-hidden="true" />
          The flow fills every field, ticks the checkboxes and presses Continue for you. If Discord
          shows a captcha, solve it on the page. The extension only touches the page after you press
          a button.
        </p>
      </SectionCard>

      <IdentityCardView
        account={account}
        clipboardClearSeconds={clipboardClearSeconds}
        revealByDefault={revealByDefault}
      />

      <SectionCard icon={<Mail size={15} />} title="After you submit" description="What happens next.">
        <p className="SettingRow__description">
          Discord emails a 6-digit code to {account.email || 'the reserved mailbox'}. Open{' '}
          <strong>Inbox</strong> in the rail - the code is extracted automatically and shown as a
          badge you can copy with one click.
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button
            variant="success"
            size="sm"
            disabled={!account.lastVerificationCode}
            loading={pastingCode}
            onClick={() => void handlePasteCode()}
            icon={<KeyRound size={14} />}
          >
            {account.lastVerificationCode
              ? `Paste ${account.lastVerificationCode} into the page`
              : 'No code captured yet'}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            loading={capturing}
            onClick={() => void handleCaptureToken()}
            icon={<KeyRound size={14} />}
          >
            Capture token &amp; profile
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onGenerate()}
            icon={<Sparkles size={14} />}
          >
            Refresh the inbox
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Chip icon={<Circle size={9} />} tone="muted">
            Submit the form
          </Chip>
          <Chip icon={<Circle size={9} />} tone="muted">
            Read the code from Inbox
          </Chip>
          <Chip icon={<Circle size={9} />} tone="muted">
            Paste the code
          </Chip>
        </div>
      </SectionCard>
    </div>
  );
}
