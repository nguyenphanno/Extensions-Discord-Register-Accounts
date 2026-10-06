import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  ExternalLink,
  Globe2,
  KeyRound,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { AccountRecord, AccountStatus } from '../../../shared/types/Account';
import { ACCOUNT_STATUS_INFO, TOKEN_STATUS_INFO } from '../../../shared/types/Account';
import { ageOn } from '../../../identity/BirthdayGenerator';
import { describeLocale } from '../../../identity/LocaleGenerator';
import { ACCOUNT_TAG_PRESETS, TAGS_MAX_COUNT } from '../../../shared/constants/AppConstants';
import { makeBackgroundCall } from '../../hooks/useAsyncTask';
import { useCopy } from '../../hooks/useCopy';
import { useToast } from '../../hooks/useToast';
import { Avatar } from '../../components/Data';
import { Button, Chip } from '../../components/Primitives';
import { ConfirmDialog } from '../../components/Feedback';
import { CopyField } from '../../components/Secrets';
import { SettingRow, TextField } from '../../components/Fields';
import { AccountStepper, type AccountStep } from './AccountStepper';

const setStatus = makeBackgroundCall((id: string, status: AccountStatus) => ({
  type: 'vault/setStatus',
  id,
  status,
}) as const);

const listVault = makeBackgroundCall(() => ({ type: 'vault/list' }) as const);

const captureToken = makeBackgroundCall((id: string) => ({
  type: 'vault/captureToken',
  id,
}) as const);

const revokeToken = makeBackgroundCall((id: string) => ({
  type: 'vault/revokeToken',
  id,
}) as const);

const applyCode = makeBackgroundCall((code: string) => ({ type: 'autofill/applyCode', code }) as const);

const DISCORD_REGISTER_URL = 'https://discord.com/register';

const patchAccount = makeBackgroundCall(
  (id: string, patch: { notes?: string; tags?: string[] }) =>
    ({ type: 'vault/patch', id, patch }) as const,
);

const rotateDiscordPassword = makeBackgroundCall((account: AccountRecord) => ({
  type: 'identity/regenerate',
  account,
  field: 'password',
}) as const);

const rotateMailboxPassword = makeBackgroundCall(
  (email: string, currentPassword: string, newPassword: string) =>
    ({
      type: 'mailbox/changePassword',
      email,
      currentPassword,
      newPassword,
    }) as const,
);

export interface VaultDetailProps {
  account: AccountRecord;
  clipboardClearSeconds: number;
  onChange: (account: AccountRecord) => void;
  onDelete: (account: AccountRecord) => void;
}

/**
 * Full detail view for one account.
 *
 * Notes and tags save on blur rather than on every keystroke: a storage write per
 * character would hammer `chrome.storage` for no benefit, and the field still
 * feels immediate because local state updates as you type.
 */
export function VaultDetail({
  account,
  clipboardClearSeconds,
  onChange,
  onDelete,
}: VaultDetailProps): ReactNode {
  const toast = useToast();
  const { copy } = useCopy(clipboardClearSeconds);

  const [notes, setNotes] = useState(account.notes);
  const [tags, setTags] = useState<string[]>(account.tags);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  // Re-sync local drafts when the selected account changes underneath us.
  useEffect(() => {
    setNotes(account.notes);
    setTags(account.tags);
  }, [account.id, account.notes, account.tags]);

  const dirty = useMemo(
    () => notes !== account.notes || tags.join('|') !== account.tags.join('|'),
    [notes, tags, account.notes, account.tags],
  );

  const patch = useCallback(
    async (next: { notes?: string; tags?: string[] }) => {
      setBusy(true);
      try {
        onChange(await patchAccount(account.id, next));
      } catch (error) {
        toast.error('Could not save', error instanceof Error ? error.message : 'Unknown error.');
      } finally {
        setBusy(false);
      }
    },
    [account.id, onChange, toast],
  );

  async function applyStatus(status: AccountStatus): Promise<void> {
    setBusy(true);
    try {
      onChange(await setStatus(account.id, status));
      toast.success('Status updated', `Marked as ${status}.`);
    } catch (error) {
      toast.error('Could not update status', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  async function rotateDiscord(): Promise<void> {
    setBusy(true);
    try {
      onChange(await rotateDiscordPassword(account));
      toast.success('Password rotated', 'Use the new value on Discord.');
    } catch (error) {
      toast.error('Rotation failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  async function rotateMailbox(): Promise<void> {
    setBusy(true);
    try {
      // The backend rejects anything under 8 characters or missing a class, so
      // the rotation value is built to satisfy that policy by construction.
      const next = `Rot${Math.random().toString(36).slice(2, 8)}A1`;
      await rotateMailboxPassword(account.email, account.emailPassword, next);
      toast.success('Mailbox password rotated', 'The vault copy has been updated.');
    } catch (error) {
      toast.error('Rotation failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Reads the token from the open Discord tab, fetches the profile behind it
   * in the background, then reloads the record so every chip updates at once.
   */
  async function handleCaptureToken(): Promise<void> {
    setBusy(true);
    try {
      const result = await captureToken(account.id);
      const latest = (await listVault()).find((entry) => entry.id === account.id);
      if (latest) onChange(latest);

      if (result.fetchedProfile) {
        toast.success('Token captured', 'Discord profile refreshed.');
      } else {
        toast.warn(
          'Token captured',
          'Discord rejected the profile request; the token is stored but may be dead.',
        );
      }
    } catch (error) {
      toast.error('Capture failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  /** Opens Discord's signup page in a tab the user is already in control of. */
  async function openRegister(): Promise<void> {
    await chrome.tabs.create({ url: DISCORD_REGISTER_URL });
  }

  /** Writes the newest code from the mailbox into the page's code field. */
  async function handlePasteCode(): Promise<void> {
    if (!account.lastVerificationCode) return;

    setBusy(true);
    try {
      const result = await applyCode(account.lastVerificationCode);
      if (result.filled === 0) {
        toast.warn('No code field found', 'Open the Discord verification screen, then try again.');
      } else {
        toast.success('Code pasted', 'Check the page, then confirm it there.');
      }
    } catch (error) {
      toast.error('Could not paste the code', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkVerified(): Promise<void> {
    setBusy(true);
    try {
      onChange(await setStatus(account.id, 'verified'));
      toast.success('Marked verified', 'The account is ready to use.');
    } catch (error) {
      toast.error('Could not update status', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * One action per unfinished step, so the checklist is not just a readout: the
   * user never has to guess which button moves the account forward.
   */
  function stepAction(step: AccountStep): ReactNode {
    if (step.done) return null;

    switch (step.id) {
      case 'submit':
        return (
          <Button variant="ghost" size="sm" onClick={() => void openRegister()} icon={<ExternalLink size={14} />}>
            Open register
          </Button>
        );

      case 'token':
        return (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void handleCaptureToken()}
            icon={<KeyRound size={14} />}
          >
            Capture
          </Button>
        );

      case 'verify':
        return account.lastVerificationCode ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void handlePasteCode()}
              icon={<KeyRound size={14} />}
            >
              Paste {account.lastVerificationCode}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void handleMarkVerified()}
              icon={<ShieldCheck size={14} />}
            >
              Mark verified
            </Button>
          </div>
        ) : null;

      default:
        return null;
    }
  }

  const age = ageOn(account.birthday);
  const tokenStatusInfo = TOKEN_STATUS_INFO.find((entry) => entry.value === account.tokenStatus);
  const tokenValue = account.token ?? '';

  /**
   * A Discord token is a bearer credential for the whole account, so copying one
   * gets a firmer warning than a password: it grants access without the password.
   */
  async function handleCopyToken(): Promise<void> {
    const copied = await copy(tokenValue, 'Discord token');
    if (!copied) return;

    toast.warn(
      'Token copied',
      clipboardClearSeconds > 0
        ? `Anyone with it can use the account. Clipboard clears in ${clipboardClearSeconds}s.`
        : 'Anyone with it can use the account. Clipboard wiping is off — clear it manually.',
    );
  }

  async function handleRevokeToken(): Promise<void> {
    setBusy(true);
    try {
      onChange(await revokeToken(account.id));
      setRevokeOpen(false);
      toast.success('Session cleared', 'The token and profile data were removed from the vault.');
    } catch (error) {
      toast.error('Could not clear the session', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="Pane__sections">
      <section className="DetailCard">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Avatar
            seed={account.avatarSeed}
            label={account.discordDisplayName}
            size="lg"
            imageUrl={account.avatarUrl}
            showPresence={account.status === 'verified'}
            presence={account.status === 'verified' ? 'online' : 'idle'}
          />
          <div className="IdentityCard__headline" style={{ flex: 1 }}>
            <h3 className="SectionCard__title">{account.discordDisplayName}</h3>
            <span className="IdentityCard__handle">@{account.discordUsername}</span>
            <div className="IdentityCard__chips">
              <Chip tone="muted" icon={<CalendarDays size={11} />}>
                {account.birthday}
                {age !== null ? ` · ${age}y` : ''}
              </Chip>
              <Chip icon={<Globe2 size={11} />}>{describeLocale(account.locale)}</Chip>
            </div>
          </div>
        </div>

        <div className="IdentityCard__fields">
          <CopyField
            label="Email"
            value={account.email}
            onCopy={() => void copy(account.email, 'Email')}
          />
          <CopyField
            label="Mailbox password"
            value={account.emailPassword}
            secret
            revealed={revealed}
            onToggleReveal={() => setRevealed((current) => !current)}
            onCopy={() => void copy(account.emailPassword, 'Mailbox password')}
          />
          <CopyField
            label="Discord password"
            value={account.discordPassword}
            secret
            revealed={revealed}
            onToggleReveal={() => setRevealed((current) => !current)}
            onCopy={() => void copy(account.discordPassword, 'Discord password')}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void rotateDiscord()}
            icon={<RefreshCw size={14} />}
          >
            Rotate Discord password
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !account.email}
            onClick={() => void rotateMailbox()}
            icon={<Mail size={14} />}
          >
            Rotate mailbox password
          </Button>
          <Button
            variant="dangerOutline"
            size="sm"
            disabled={busy}
            onClick={() => onDelete(account)}
            icon={<Trash2 size={14} />}
          >
            Delete
          </Button>
        </div>
      </section>

      <section className="DetailCard">
        <div className="SectionCard__heading">
          <h3 className="SectionCard__title">Next steps</h3>
          <p className="SectionCard__description">
            Derived from what this record already knows, so it never drifts from reality.
          </p>
        </div>

        <AccountStepper account={account} actionFor={stepAction} />
      </section>

      <section className="DetailCard">
        <div className="SectionCard__heading">
          <h3 className="SectionCard__title">Lifecycle</h3>
          <p className="SectionCard__description">
            Mark where this account got to. Nothing advances automatically.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {ACCOUNT_STATUS_INFO.map((info) => (
            <Chip
              key={info.value}
              tone={account.status === info.value ? 'accent' : 'muted'}
              title={info.description}
              icon={account.status === info.value ? <ShieldCheck size={11} /> : undefined}
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyStatus(info.value)}
                className="Chip__button"
              >
                {info.label}
              </button>
            </Chip>
          ))}
        </div>

        <SettingRow
          label="Timestamps"
          description="Stamped when you change the status."
          control={
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right' }}>
              {account.registeredAt
                ? `Registered ${new Date(account.registeredAt).toLocaleDateString()}`
                : 'Not registered'}
              <br />
              {account.verifiedAt
                ? `Verified ${new Date(account.verifiedAt).toLocaleDateString()}`
                : 'Not verified'}
            </span>
          }
        />
      </section>

      <section className="DetailCard">
        <div className="SectionCard__heading">
          <h3 className="SectionCard__title">Discord session</h3>
          <p className="SectionCard__description">
            Capture the login token from the open Discord tab, then refresh the profile behind it.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => void handleCaptureToken()}
            icon={<KeyRound size={14} />}
          >
            Capture token &amp; profile
          </Button>

          {tokenValue ? (
            <Button
              variant="dangerOutline"
              size="sm"
              disabled={busy}
              onClick={() => setRevokeOpen(true)}
              icon={<Trash2 size={14} />}
            >
              Revoke session
            </Button>
          ) : null}

          {tokenStatusInfo ? (
            <Chip tone={tokenStatusInfo.tone} title={tokenStatusInfo.description}>
              {tokenStatusInfo.label}
            </Chip>
          ) : null}

          <Chip tone={account.nitroTier === 'none' ? 'muted' : 'accent'} title="Nitro tier">
            Nitro: {account.nitroTier}
          </Chip>

          {account.phoneLocked ? (
            <Chip tone="warning" title="Discord will demand phone verification for this account.">
              Phone lock
            </Chip>
          ) : null}

          {account.badges.map((badge) => (
            <Chip key={badge} tone="accent" title="Discord public badge">
              {badge}
            </Chip>
          ))}
        </div>

        {tokenValue ? (
          <CopyField
            label="Discord token"
            value={tokenValue}
            secret
            revealed={revealed}
            onToggleReveal={() => setRevealed((current) => !current)}
            onCopy={() => void handleCopyToken()}
          />
        ) : (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            No token captured yet. Open Discord in a tab while logged in, then press capture.
          </p>
        )}

        {account.avatarDecorationUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <img
              src={account.avatarDecorationUrl}
              alt=""
              width={48}
              height={48}
              style={{ borderRadius: 'var(--radius-md)' }}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Avatar decoration
            </span>
          </div>
        ) : null}

        <SettingRow
          label="Discord account"
          description="Profile data fetched from Discord using the captured token."
          control={
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right' }}>
              {account.discordUserId ? `ID ${account.discordUserId}` : 'ID not captured'}
              <br />
              {account.discordCreatedAt
                ? `Created ${new Date(account.discordCreatedAt).toLocaleDateString()}`
                : 'Creation date unknown'}
              <br />
              {account.profileFetchedAt
                ? `Profile ${new Date(account.profileFetchedAt).toLocaleString()}`
                : 'Profile never fetched'}
            </span>
          }
        />
      </section>

      <section className="DetailCard">
        <div className="SectionCard__heading">
          <h3 className="SectionCard__title">Notes &amp; tags</h3>
          <p className="SectionCard__description">Saved when you click away from a field.</p>
        </div>

        <TextField
          id="vault-notes"
          label="Notes"
          value={notes}
          onChange={setNotes}
          onBlur={() => {
            if (notes !== account.notes) void patch({ notes });
          }}
          placeholder="What was this account for?"
          maxLength={500}
        />

        <div className="Field">
          <div className="Field__labelRow">
            <span className="Field__label">Tags</span>
            <span className="Field__hint">
              {tags.length}/{TAGS_MAX_COUNT}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {[...new Set([...ACCOUNT_TAG_PRESETS, ...tags])].map((tag) => {
              const active = tags.includes(tag);
              return (
                <Chip key={tag} tone={active ? 'accent' : 'default'}>
                  <button
                    type="button"
                    disabled={!active && tags.length >= TAGS_MAX_COUNT}
                    onClick={() => {
                      const next = active ? tags.filter((entry) => entry !== tag) : [...tags, tag];
                      setTags(next);
                      void patch({ tags: next });
                    }}
                    className="Chip__button"
                  >
                    {tag}
                  </button>
                </Chip>
              );
            })}
          </div>
        </div>

        {dirty ? (
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => void patch({ notes, tags })}
            icon={<Save size={14} />}
          >
            Save changes
          </Button>
        ) : null}
      </section>

      <ConfirmDialog
        open={revokeOpen}
        title="Clear the stored session?"
        description="The token and every profile field fetched with it are removed from this browser. The account itself, its email and its Discord password stay untouched, and you can capture a fresh token later."
        confirmLabel="Clear session"
        busy={busy}
        onConfirm={() => void handleRevokeToken()}
        onCancel={() => setRevokeOpen(false)}
      />
    </div>
  );
}