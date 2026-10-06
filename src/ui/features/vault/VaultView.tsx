import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  CheckSquare,
  Download,
  Eye,
  FileJson,
  Search,
  ShieldCheck,
  Square,
  Tag,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import type { AccountRecord, AccountStatus, TokenStatus } from '../../../shared/types/Account';
import { ACCOUNT_STATUS_INFO, TOKEN_STATUS_INFO } from '../../../shared/types/Account';
import type { ExportFormat, VaultClearScope } from '../../../shared/types/Messages';
import { downloadFile, pickTextFile } from '../../lib/DownloadFile';
import { Avatar, StatCard, StatGrid } from '../../components/Data';
import { Button, Chip, EmptyState, IconButton } from '../../components/Primitives';
import { ConfirmDialog } from '../../components/Feedback';
import { useCopy } from '../../hooks/useCopy';
import { useVault } from '../../hooks/useVault';
import { useToast } from '../../hooks/useToast';
import { buildExport } from '../../../storage/VaultExporter';
import { VaultDetail } from './VaultDetail';

export interface VaultViewProps {
  revealByDefault: boolean;
  clipboardClearSeconds: number;
  confirmDestructive: boolean;
  selectedAccountId: string | null;
  onSelectAccount: (account: AccountRecord | null) => void;
}

const CLEAR_OPTIONS: { scope: VaultClearScope; label: string; description: string }[] = [
  {
    scope: 'accounts',
    label: 'saved accounts',
    description: 'Deletes every account together with its identity fingerprints.',
  },
  {
    scope: 'activity',
    label: 'the activity log',
    description: 'Empties the audit trail.',
  },
  {
    scope: 'settings',
    label: 'settings',
    description: 'Restores every preference to its default.',
  },
  {
    scope: 'everything',
    label: 'all extension data',
    description: 'Wipes accounts, the audit trail and settings.',
  },
];

/**
 * Credential vault.
 *
 * Every destructive action routes through an explicit scope so "Clear" can
 * never mean more than the user asked for, and the confirmation dialog names
 * the exact scope being cleared.
 */
export function VaultView({
  revealByDefault,
  clipboardClearSeconds,
  confirmDestructive,
  selectedAccountId,
  onSelectAccount,
}: VaultViewProps): ReactNode {
  const toast = useToast();
  const vault = useVault();
  const { copy } = useCopy(clipboardClearSeconds);

  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState(revealByDefault);
  const [pendingClear, setPendingClear] = useState<VaultClearScope | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountRecord | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all');
  const [tokenFilter, setTokenFilter] = useState<TokenStatus | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Every tag in use, so the filter row reflects reality rather than presets.
  const allTags = useMemo(
    () => [...new Set(vault.accounts.flatMap((account) => account.tags))].sort(),
    [vault.accounts],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return vault.accounts.filter((account) => {
      if (statusFilter !== 'all' && account.status !== statusFilter) return false;
      if (tokenFilter !== 'all' && account.tokenStatus !== tokenFilter) return false;
      if (tagFilter && !account.tags.includes(tagFilter)) return false;
      if (!needle) return true;

      return (
        account.discordDisplayName.toLowerCase().includes(needle) ||
        account.discordUsername.toLowerCase().includes(needle) ||
        account.email.toLowerCase().includes(needle) ||
        account.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [vault.accounts, query, statusFilter, tokenFilter, tagFilter]);

  async function handleBulkExport(format: 'json' | 'csv'): Promise<void> {
    const chosen = vault.accounts.filter((account) => checked.has(account.id));
    if (chosen.length === 0) return;

    const payload = buildExport(chosen, format);
    downloadFile(payload.filename, payload.content, payload.mimeType);
    toast.success('Selection exported', `${chosen.length} account(s) -> ${payload.filename}`);
  }

  async function handleBulkDelete(): Promise<void> {
    setBusy(true);
    try {
      for (const id of checked) {
        await vault.remove(id);
      }
      toast.success('Deleted', `${checked.size} account${checked.size === 1 ? '' : 's'} removed.`);
      setChecked(new Set());
      onSelectAccount(null);
    } catch (error) {
      toast.error('Delete failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
      setBulkDeleteOpen(false);
    }
  }

  async function handleBulkTag(): Promise<void> {
    const tag = bulkTag.trim().toLowerCase();
    if (!tag || checked.size === 0) return;

    setBusy(true);
    try {
      for (const id of checked) {
        const account = vault.accounts.find((entry) => entry.id === id);
        if (!account || account.tags.includes(tag)) continue;
        await vault.save({ ...account, tags: [...account.tags, tag] });
      }
      await vault.reload();
      toast.success('Tagged', `"${tag}" applied to ${checked.size} account(s).`);
      setChecked(new Set());
      setBulkTag('');
    } catch (error) {
      toast.error('Tag failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  const selected = useMemo(
    () => vault.accounts.find((account) => account.id === selectedAccountId) ?? visible[0] ?? null,
    [vault.accounts, selectedAccountId, visible],
  );

  // The selection helpers close over `visible`, and `useCallback` evaluates its
  // dependency array immediately, so they must be declared after it.
  const toggleChecked = useCallback((id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleChecked =
    visible.length > 0 && visible.every((account) => checked.has(account.id));

  const toggleSelectAll = useCallback(() => {
    setChecked(allVisibleChecked ? new Set() : new Set(visible.map((account) => account.id)));
  }, [allVisibleChecked, visible]);

  async function handleExport(format: ExportFormat): Promise<void> {
    setBusy(true);
    try {
      const payload = await vault.buildExport(format);
      downloadFile(payload.filename, payload.content, payload.mimeType);
      toast.success('Export ready', payload.filename);
    } catch (error) {
      toast.error('Export failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(): Promise<void> {
    const raw = await pickTextFile('application/json,.json,text/plain,.txt');
    if (!raw) return;

    setBusy(true);
    try {
      const result = await vault.runImport(raw);
      await vault.reload();

      const extra = result.tokensOnly > 0 ? `, ${result.tokensOnly} token-only line(s) skipped` : '';
      toast.success(
        'Import complete',
        `${result.imported} added, ${result.skipped} skipped (duplicates or invalid)${extra}.`,
      );
    } catch (error) {
      toast.error('Import failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }

  async function handleClear(scope: VaultClearScope): Promise<void> {
    setBusy(true);
    try {
      const removed = await vault.clear(scope);
      onSelectAccount(null);
      toast.success('Cleared', `${removed} item${removed === 1 ? '' : 's'} removed.`);
    } catch (error) {
      toast.error('Clear failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
      setPendingClear(null);
    }
  }

  const pendingClearOption = CLEAR_OPTIONS.find((option) => option.scope === pendingClear);

  return (
    <>
      <div className="Pane__sections">
        <StatGrid>
          <StatCard label="Accounts" value={vault.stats.total} tone="accent" />
          <StatCard label="Registered" value={vault.stats.registered} tone="success" />
          <StatCard label="Verified" value={vault.stats.verified} tone="success" />
          <StatCard label="Codes found" value={vault.stats.withCode} tone="warning" />
          <StatCard label="Live tokens" value={vault.stats.tokenLive} tone="success" />
          <StatCard
            label="Dead tokens"
            value={vault.stats.tokenDead}
            tone={vault.stats.tokenDead > 0 ? 'danger' : 'default'}
          />
        </StatGrid>

        <div
          className="Toolbar"
          style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--divider)' }}
        >
          <div className="SearchBox">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, handle, email or tag…"
              aria-label="Search accounts"
              className="SearchBox__input"
            />
          </div>

          <IconButton
            label={revealed ? 'Hide secrets' : 'Reveal secrets'}
            active={revealed}
            onClick={() => setRevealed((current) => !current)}
            icon={<Eye size={15} />}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void handleExport('json')}
            icon={<FileJson size={14} />}
          >
            Export JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void handleExport('csv')}
            icon={<Download size={14} />}
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void handleExport('txt-tokens')}
            icon={<Download size={14} />}
          >
            Export TXT (tokens)
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void handleExport('txt-full')}
            icon={<Download size={14} />}
          >
            Export TXT (full)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void handleImport()}
            icon={<Upload size={14} />}
          >
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void vault.reload()}
            icon={<ShieldCheck size={14} />}
          >
            Refresh
          </Button>
        </div>

        <div
          className="Toolbar"
          style={{ flexWrap: 'wrap', borderRadius: 'var(--radius-lg)', border: '1px solid var(--divider)' }}
        >
          <Chip tone={statusFilter === 'all' ? 'accent' : 'muted'}>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="Chip__button"
            >
              All ({vault.accounts.length})
            </button>
          </Chip>

          {ACCOUNT_STATUS_INFO.map((info) => {
            const count = vault.accounts.filter((account) => account.status === info.value).length;
            if (count === 0 && statusFilter !== info.value) return null;

            return (
              <Chip
                key={info.value}
                tone={statusFilter === info.value ? 'accent' : 'muted'}
                title={info.description}
              >
                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === info.value ? 'all' : info.value)}
                  className="Chip__button"
                >
                  {info.label} ({count})
                </button>
              </Chip>
            );
          })}

          <Chip tone={tokenFilter === 'all' ? 'accent' : 'muted'}>
            <button
              type="button"
              onClick={() => setTokenFilter('all')}
              className="Chip__button"
            >
              Any token ({vault.stats.withToken})
            </button>
          </Chip>

          {TOKEN_STATUS_INFO.filter((info) => info.value !== 'none').map((info) => {
            const count = vault.accounts.filter((account) => account.tokenStatus === info.value).length;
            if (count === 0 && tokenFilter !== info.value) return null;

            return (
              <Chip
                key={info.value}
                tone={tokenFilter === info.value ? 'accent' : 'muted'}
                title={info.description}
              >
                <button
                  type="button"
                  onClick={() => setTokenFilter(tokenFilter === info.value ? 'all' : info.value)}
                  className="Chip__button"
                >
                  {info.label} ({count})
                </button>
              </Chip>
            );
          })}

          {allTags.map((tag) => (
            <Chip
              key={tag}
              tone={tagFilter === tag ? 'accent' : 'muted'}
              icon={<Tag size={10} />}
            >
              <button
                type="button"
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                className="Chip__button"
              >
                {tag}
              </button>
            </Chip>
          ))}

          {statusFilter !== 'all' || tokenFilter !== 'all' || tagFilter ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setTokenFilter('all');
                setTagFilter(null);
              }}
            >
              Reset filters
            </Button>
          ) : null}
        </div>

        {visible.length > 0 ? (
          <div className="Toolbar" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--divider)' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectAll}
              icon={allVisibleChecked ? <CheckSquare size={14} /> : <Square size={14} />}
            >
              {allVisibleChecked ? 'Deselect all' : `Select all (${visible.length})`}
            </Button>

            {checked.size > 0 ? (
              <>
                <span className="Chip Chip--accent">{checked.size} selected</span>

                <input
                  value={bulkTag}
                  onChange={(event) => setBulkTag(event.target.value)}
                  placeholder="tag…"
                  aria-label="Tag to apply to the selection"
                  className="Field__input"
                  style={{
                    height: 30,
                    maxWidth: 120,
                    padding: '0 var(--space-2)',
                    background: 'var(--bg-app)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || bulkTag.trim().length === 0}
                  onClick={() => void handleBulkTag()}
                  icon={<Tag size={14} />}
                >
                  Tag
                </Button>

                <Button
                  variant="dangerOutline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setBulkDeleteOpen(true)}
                  icon={<Trash2 size={14} />}
                >
                  Delete
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleBulkExport('csv')}
                  icon={<Download size={14} />}
                >
                  Export
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChecked(new Set())}
                >
                  Clear selection
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Users size={24} />}
          title={query ? 'No matches' : 'The vault is empty'}
          body={
            query
              ? 'Try a different search term.'
              : 'Generated identities are saved here automatically, with their mailbox credentials.'
          }
        />
      ) : (
        visible.map((account) => (
          <div
            key={account.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectAccount(account)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelectAccount(account);
            }}
            className={`VaultRow${account.id === selected?.id ? ' VaultRow--active' : ''}`}
          >
            <IconButton
              label={checked.has(account.id) ? 'Deselect this account' : 'Select this account'}
              active={checked.has(account.id)}
              onClick={() => toggleChecked(account.id)}
              icon={checked.has(account.id) ? <CheckSquare size={16} /> : <Square size={16} />}
            />

            <Avatar
              seed={account.avatarSeed}
              label={account.discordDisplayName}
              size="md"
              imageUrl={account.avatarUrl}
            />

            <div className="VaultRow__identity">
              <span className="VaultRow__name">{account.discordDisplayName}</span>
              <span className="VaultRow__email">{account.email || 'no mailbox'}</span>
            </div>

            <div className="VaultRow__tags">
              {account.lastVerificationCode ? (
                <Chip tone="success">{account.lastVerificationCode}</Chip>
              ) : null}
              <Chip tone={account.status === 'registered' ? 'accent' : 'muted'}>{account.status}</Chip>
              {account.token && account.tokenStatus !== 'none'
                ? (() => {
                    const info = TOKEN_STATUS_INFO.find((entry) => entry.value === account.tokenStatus);
                    return info ? (
                      <Chip tone={info.tone} title={info.description}>
                        {info.label}
                      </Chip>
                    ) : null;
                  })()
                : null}
            </div>

            <IconButton
              label={`Copy the Discord password for ${account.discordDisplayName}`}
              onClick={() => void copy(account.discordPassword, 'Discord password')}
              icon={<Eye size={15} />}
            />
            <IconButton
              label={`Delete ${account.discordDisplayName}`}
              tone="danger"
              onClick={() =>
                confirmDestructive ? setDeleteTarget(account) : void vault.remove(account.id)
              }
              icon={<Trash2 size={15} />}
            />
          </div>
        ))
      )}

      {selected ? (
        <>
          <div className="Toolbar">
            <span
              style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}
            >
              {selected.discordDisplayName}
            </span>
            <span className="Toolbar__spacer" />
            <Button variant="ghost" size="sm" onClick={() => onSelectAccount(null)}>
              Close detail
            </Button>
          </div>

          <VaultDetail
            account={selected}
            clipboardClearSeconds={clipboardClearSeconds}
            onChange={(updated) => {
              vault.save(updated).catch(() => undefined);
              onSelectAccount(updated);
            }}
            onDelete={(account) =>
              confirmDestructive ? setDeleteTarget(account) : void vault.remove(account.id)
            }
          />
        </>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.discordDisplayName ?? 'this account'}?`}
        description="The saved credentials are removed from this browser. The mailbox itself is not deleted on the server."
        confirmLabel="Delete account"
        busy={busy}
        onConfirm={async () => {
          if (deleteTarget) await vault.remove(deleteTarget.id);
          setDeleteTarget(null);
          onSelectAccount(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={`Delete ${checked.size} account${checked.size === 1 ? '' : 's'}?`}
        description="Every selected record is removed from this browser. The mailboxes themselves stay alive on the server."
        confirmLabel={`Delete ${checked.size}`}
        busy={busy}
        onConfirm={() => void handleBulkDelete()}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      <ConfirmDialog
        open={pendingClear !== null}
        title={`Clear ${pendingClearOption?.label ?? ''}?`}
        description={`${pendingClearOption?.description ?? ''} This cannot be undone.`}
        confirmLabel="Clear"
        busy={busy}
        onConfirm={() => pendingClear && void handleClear(pendingClear)}
        onCancel={() => setPendingClear(null)}
      />
    </>
  );
}

/** Exposed so the command palette can offer the same scoped clears. */
export { CLEAR_OPTIONS };
