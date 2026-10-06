import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Inbox, MailOpen, RefreshCw, Search } from 'lucide-react';
import type { AccountRecord } from '../../../shared/types/Account';
import type { TempMailMessage } from '../../../shared/types/Mail';
import { toMailSummaries } from '../../../email/MailSummarizer';
import { makeBackgroundCall } from '../../hooks/useAsyncTask';
import { useToast } from '../../hooks/useToast';
import { formatRelative } from '../../lib/FormatDate';
import { Avatar, ListRow } from '../../components/Data';
import { Button, Chip, EmptyState, Skeleton } from '../../components/Primitives';
import { MailReaderView } from './MailReaderView';

const fetchInbox = makeBackgroundCall((email: string, password: string) => ({
  type: 'mailbox/inbox',
  email,
  password,
}) as const);

export interface InboxViewProps {
  accounts: readonly AccountRecord[];
  selectedAccount: AccountRecord | null;
  onSelectAccount: (account: AccountRecord) => void;
  loadRemoteImages: boolean;
  clipboardClearSeconds: number;
  onSwitchToVault: () => void;
}

/**
 * Mailbox browser.
 *
 * The mailbox picker and the message list share one column because they are
 * sequential decisions - pick a mailbox, then pick a message - and giving each
 * a permanent pane of its own wasted half the available width.
 */
export function InboxView({
  accounts,
  selectedAccount,
  onSelectAccount,
  loadRemoteImages,
  clipboardClearSeconds,
  onSwitchToVault,
}: InboxViewProps): ReactNode {
  const toast = useToast();

  const [messages, setMessages] = useState<TempMailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);

  const mailboxAccounts = useMemo(
    () => accounts.filter((account) => account.email.length > 0),
    [accounts],
  );

  const load = useCallback(
    async (account: AccountRecord, silent: boolean) => {
      if (!silent) setLoading(true);

      try {
        const inbox = await fetchInbox(account.email, account.emailPassword);
        setMessages(inbox);

        if (!silent) {
          toast.success(
            'Inbox refreshed',
            `${inbox.length} message${inbox.length === 1 ? '' : 's'} in ${account.email}.`,
          );
        }
      } catch (error) {
        setMessages([]);
        if (!silent) {
          toast.error(
            'Could not read this mailbox',
            error instanceof Error ? error.message : 'The mailbox service did not respond.',
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  // Reload on mailbox change and clear the reader, so a message from the
  // previous mailbox is never left on screen.
  useEffect(() => {
    setSelectedMessageId(null);

    if (selectedAccount?.email) void load(selectedAccount, true);
    else setMessages([]);
  }, [load, selectedAccount]);

  const sortedSummaries = toMailSummaries(messages);

  const summaries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sortedSummaries;

    return sortedSummaries.filter(
      (summary) =>
        summary.subject.toLowerCase().includes(needle) ||
        summary.fromAddress.toLowerCase().includes(needle) ||
        summary.preview.toLowerCase().includes(needle),
    );
  }, [sortedSummaries, query]);

  const selectedMessage = useMemo(() => {
    if (messages.length === 0) return null;
    const wantedId = selectedMessageId ?? summaries[0]?.id ?? messages[0]?.id;
    return messages.find((message) => message.id === wantedId) ?? null;
  }, [messages, selectedMessageId, summaries]);

  const activeAccount = selectedAccount?.email ? selectedAccount : (mailboxAccounts[0] ?? null);

  if (mailboxAccounts.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={24} />}
        title="No mailboxes yet"
        body="Generate an identity first. Every generated account reserves its own temporary mailbox."
        action={
          <Button variant="outline" onClick={onSwitchToVault}>
            Open the vault
          </Button>
        }
      />
    );
  }

  return (
    <div className="PanelSplit">
      <div className="PanelSplit__list">
        <div className="Toolbar">
          <div className="SearchBox">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter messages…"
              aria-label="Filter messages"
              className="SearchBox__input"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            disabled={!activeAccount || loading}
            onClick={() => activeAccount && void load(activeAccount, false)}
            icon={<RefreshCw size={14} />}
          >
            Refresh
          </Button>
        </div>

        {mailboxAccounts.length > 1 ? (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              overflowX: 'auto',
              borderBottom: '1px solid var(--divider)',
            }}
          >
            {mailboxAccounts.slice(0, 6).map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => onSelectAccount(account)}
                title={account.email}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
              >
                <Chip tone={account.id === activeAccount?.id ? 'accent' : 'default'}>
                  {account.discordDisplayName}
                </Chip>
              </button>
            ))}
          </div>
        ) : null}

        {loading && summaries.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : summaries.length === 0 ? (
          <EmptyState
            icon={<MailOpen size={22} />}
            title="Inbox is empty"
            body="Register on Discord and the verification message will appear here."
          />
        ) : (
          summaries.map((summary) => (
            <ListRow
              key={summary.id}
              active={summary.id === selectedMessage?.id}
              unread={summary.isUnread}
              onClick={() => setSelectedMessageId(summary.id)}
              title={summary.subject}
              subtitle={summary.preview}
              meta={formatRelative(summary.receivedAt)}
              leading={
                <Avatar
                  seed={summary.fromAddress || summary.subject}
                  label={summary.fromDisplayName}
                  size="sm"
                />
              }
              trailing={
                summary.verificationCode ? <Chip tone="success">{summary.verificationCode}</Chip> : null
              }
            />
          ))
        )}
      </div>

      <div className="PanelSplit__detail">
        {selectedMessage ? (
          <MailReaderView
            message={selectedMessage}
            loadRemoteImages={loadRemoteImages}
            clipboardClearSeconds={clipboardClearSeconds}
          />
        ) : (
          <EmptyState
            icon={<MailOpen size={24} />}
            title="Select a message"
            body="Nothing is selected yet."
          />
        )}
      </div>
    </div>
  );
}
