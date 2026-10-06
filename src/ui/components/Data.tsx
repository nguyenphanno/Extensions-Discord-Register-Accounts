import type { ReactNode } from 'react';
import type { ActivityEntry } from '../../shared/types/Activity';
import { avatarBackground, describeAvatar } from '../../identity/AvatarGenerator';
import { cx } from '../lib/ClassNames';
import { formatRelative, formatTime } from '../lib/FormatDate';

export interface AvatarProps {
  /** Deterministic seed; the same seed always paints the same colours. */
  seed: string;
  /** Text the initials are derived from, usually the display name. */
  label: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  presence?: 'online' | 'idle' | 'busy' | 'offline';
  showPresence?: boolean;
  /** Real Discord avatar URL; when set it replaces the generated initials. */
  imageUrl?: string | null;
}

/**
 * Discord-style letter avatar.
 *
 * Discord's own default avatars are a coloured disc with the member's
 * initials, so that is exactly what we render. No bitmap, no clip-art: the
 * descriptor is derived from the seed and the CSS gradient does the rest.
 * When the vault has a real Discord avatar URL, the photo wins.
 */
export function Avatar({
  seed,
  label,
  size = 'md',
  presence = 'offline',
  showPresence = false,
  imageUrl = null,
}: AvatarProps): ReactNode {
  const descriptor = describeAvatar(seed, label);

  return (
    <span className="Avatar__wrap">
      <span
        className={cx('Avatar', `Avatar--${size}`)}
        style={imageUrl ? undefined : { background: avatarBackground(descriptor) }}
        aria-hidden="true"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
          />
        ) : (
          descriptor.initials
        )}
      </span>
      {showPresence ? (
        <span className={cx('Avatar__presence', `Avatar__presence--${presence}`)} />
      ) : null}
    </span>
  );
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
}

export function StatCard({ label, value, tone = 'default' }: StatCardProps): ReactNode {
  return (
    <div className={cx('StatCard', tone !== 'default' ? `StatCard--${tone}` : null)}>
      <span className="StatCard__label">{label}</span>
      <span className="StatCard__value">{value}</span>
    </div>
  );
}

export interface StatGridProps {
  children: ReactNode;
}

export function StatGrid({ children }: StatGridProps): ReactNode {
  return <div className="StatGrid">{children}</div>;
}

export interface ListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  meta?: ReactNode;
  active?: boolean;
  unread?: boolean;
  onClick?: () => void;
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  meta,
  active = false,
  unread = false,
  onClick,
}: ListRowProps): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('ListRow', active ? 'ListRow--active' : null, unread ? 'ListRow--unread' : null)}
    >
      {leading}
      <span className="ListRow__body">
        <span className="ListRow__topLine">
          <span className="ListRow__title">{title}</span>
          {meta ? <span className="ListRow__meta">{meta}</span> : null}
        </span>
        {subtitle ? <span className="ListRow__subtitle">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="ListRow__trailing">{trailing}</span> : null}
    </button>
  );
}

export interface LogFeedProps {
  entries: readonly ActivityEntry[];
  emptyState: ReactNode;
}

/** Timeline rendering of the audit log; oldest entry is styled with a tail. */
export function LogFeed({ entries, emptyState }: LogFeedProps): ReactNode {
  if (entries.length === 0) return <>{emptyState}</>;

  return (
    <div className="LogFeed">
      {entries.map((entry, index) => (
        <article key={entry.id} className={cx('LogEntry', `LogEntry--${entry.severity}`)}>
          <div className="LogEntry__rail" aria-hidden="true">
            <span className="LogEntry__dot" />
            {index < entries.length - 1 ? <span className="LogEntry__line" /> : null}
          </div>

          <div className="LogEntry__body">
            <div className="LogEntry__head">
              <span className="LogEntry__kind">{humanizeKind(entry.kind)}</span>
              <time className="LogEntry__time" dateTime={new Date(entry.at).toISOString()}>
                {formatTime(entry.at)} · {formatRelative(entry.at)}
              </time>
            </div>

            <p className="LogEntry__message">{entry.message}</p>

            {entry.detail ? (
              <div className="LogEntry__detail">
                {Object.entries(entry.detail).map(([key, value]) => (
                  <span key={key} className="Chip Chip--muted">
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

/** `verificationCodeFound` -> `Verification code found`. */
function humanizeKind(kind: string): string {
  return kind
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (char) => char.toUpperCase());
}

export interface KeyValueGridProps {
  rows: readonly { label: string; value: ReactNode }[];
}

export function KeyValueGrid({ rows }: KeyValueGridProps): ReactNode {
  return (
    <dl style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {rows.map((row) => (
        <div
          key={row.label}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--space-4)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <dt style={{ color: 'var(--text-muted)', minWidth: 128 }}>{row.label}</dt>
          <dd style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
