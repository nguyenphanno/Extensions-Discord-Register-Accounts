import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Globe2, Info, Sparkles, Wand2 } from 'lucide-react';
import type { AccountRecord } from '../../../shared/types/Account';
import type { RegenerableField } from '../../../shared/types/Messages';
import { ageOn } from '../../../identity/BirthdayGenerator';
import { describeLocale } from '../../../identity/LocaleGenerator';
import { Avatar } from '../../components/Data';
import { Chip, IconButton, Tooltip } from '../../components/Primitives';
import { CopyField } from '../../components/Secrets';
import { useCopy } from '../../hooks/useCopy';

export interface IdentityCardViewProps {
  account: AccountRecord;
  clipboardClearSeconds: number;
  revealByDefault: boolean;
  onRegenerate?: () => void;
  /** Re-rolls exactly one field, keeping the mailbox and everything else. */
  onRegenerateField?: (field: RegenerableField) => void;
  /** Field currently being re-rolled; shows a spinner on that row only. */
  regenerating?: RegenerableField | null;
  footer?: ReactNode;
}

/**
 * The generated identity, rendered the way Discord would present a profile.
 *
 * Every field is individually copyable because the signup form asks for them
 * one at a time; a single "copy everything" button would just move the problem
 * to the user's clipboard.
 */
export function IdentityCardView({
  account,
  clipboardClearSeconds,
  revealByDefault,
  onRegenerate,
  onRegenerateField,
  regenerating = null,
  footer,
}: IdentityCardViewProps): ReactNode {
  const { copy } = useCopy(clipboardClearSeconds);
  const [revealed, setRevealed] = useState(revealByDefault);

  useEffect(() => {
    setRevealed(revealByDefault);
  }, [revealByDefault, account.id]);

  const age = ageOn(account.birthday);
  const hasMailbox = account.email.length > 0;

  return (
    <article className="IdentityCard">
      <div className="IdentityCard__hero">
        <Avatar seed={account.avatarSeed} label={account.discordDisplayName} size="lg" presence="online" showPresence />

        <div className="IdentityCard__headline">
          <h3 className="IdentityCard__name">{account.discordDisplayName}</h3>
          <span className="IdentityCard__handle">
            {account.discordUsername ? `@${account.discordUsername}` : 'handle not set'}
          </span>
        </div>

        {onRegenerate ? (
          <div style={{ marginLeft: 'auto' }}>
            <Tooltip text="Generate a new identity">
              <IconButton label="Generate a new identity" onClick={onRegenerate} icon={<Wand2 size={16} />} />
            </Tooltip>
          </div>
        ) : null}
      </div>

      <div className="IdentityCard__chips">
        <Chip tone={hasMailbox ? 'success' : 'warning'} icon={<Sparkles size={12} />}>
          {hasMailbox ? 'Mailbox ready' : 'No mailbox yet'}
        </Chip>

        {age !== null ? (
          <Chip icon={<CalendarDays size={12} />} title="Date of birth">
            {account.birthday} · {age}y
          </Chip>
        ) : null}

        <Chip icon={<Globe2 size={12} />} title="Locale">
          {describeLocale(account.locale)}
        </Chip>
      </div>

      <div className="IdentityCard__fields">
        <CopyField
          label="Email"
          value={account.email}
          onCopy={() => void copy(account.email, 'Email')}
          emptyLabel="Generate to reserve a mailbox"
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
          label="Discord display name"
          value={account.discordDisplayName}
          onCopy={() => void copy(account.discordDisplayName, 'Display name')}
          onRegenerate={
            onRegenerateField
              ? () => onRegenerateField('displayName')
              : undefined
          }
          busy={regenerating === 'displayName'}
        />

        <CopyField
          label="Discord username"
          value={account.discordUsername}
          onCopy={() => void copy(`@${account.discordUsername}`, 'Username')}
          onRegenerate={onRegenerateField ? () => onRegenerateField('username') : undefined}
          busy={regenerating === 'username'}
        />

        <CopyField
          label="Discord password"
          value={account.discordPassword}
          secret
          revealed={revealed}
          onToggleReveal={() => setRevealed((current) => !current)}
          onCopy={() => void copy(account.discordPassword, 'Discord password')}
          onRegenerate={onRegenerateField ? () => onRegenerateField('password') : undefined}
          busy={regenerating === 'password'}
        />

        <CopyField
          label="Date of birth"
          value={account.birthday}
          onCopy={() => void copy(account.birthday, 'Date of birth')}
          onRegenerate={onRegenerateField ? () => onRegenerateField('birthday') : undefined}
          busy={regenerating === 'birthday'}
        />
      </div>

      <p
        className="Field__hint"
        style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}
      >
        <Info size={13} style={{ marginTop: 2, flex: 'none' }} aria-hidden="true" />
        You still solve the captcha and press Create account yourself. This tool prepares the
        credentials and reserves the mailbox - it never submits a form on your behalf.
      </p>

      {footer}
    </article>
  );
}
