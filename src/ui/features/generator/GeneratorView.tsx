import { useState, type ReactNode } from 'react';
import { Eraser, Layers, RefreshCw, Send, Sparkles, Trash2 } from 'lucide-react';
import type { ExtensionSettings } from '../../../shared/types/Settings';
import { BATCH_MAX_COUNT, BATCH_MIN_COUNT } from '../../../shared/constants/AppConstants';
import { Button, Chip, EmptyState, ProgressBar, Segmented } from '../../components/Primitives';
import { SettingRow } from '../../components/Fields';
import { ConfirmDialog } from '../../components/Feedback';
import { useUiStore } from '../../state/UiStore';
import { useToast } from '../../hooks/useToast';
import { IdentityCardView } from './IdentityCardView';
import { useIdentityGenerator } from './useIdentityGenerator';

export interface GeneratorViewProps {
  settings: ExtensionSettings;
  accountCount: number;
  onOpenVault: () => void;
}

const COUNT_PRESETS = [1, 3, 5, 10] as const;

/**
 * The generator screen.
 *
 * Two modes share one surface:
 *  - single: generate one identity, review it, fill the page
 *  - batch : queue N identities, review the list, jump to the vault
 *
 * The split exists because a batch is a materially different task from one
 * account, and burying that behind a number input made the common case heavy.
 */
export function GeneratorView({ settings, accountCount, onOpenVault }: GeneratorViewProps): ReactNode {
  const toast = useToast();
  const draft = useUiStore((state) => state.draft);
  const batchDrafts = useUiStore((state) => state.batchDrafts);
  const setDraft = useUiStore((state) => state.setDraft);
  const setBatchDrafts = useUiStore((state) => state.setBatchDrafts);

  const generator = useIdentityGenerator();

  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [count, setCount] = useState(3);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const hasDraft = draft !== null;

  function handleClear(): void {
    setDraft(null);
    setBatchDrafts([]);
    setConfirmClearOpen(false);
    toast.info('Cleared', 'The generator has been reset.');
  }

  return (
    <>
      <div className="Pane__sections">
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-xl)',
            background:
              'linear-gradient(150deg, var(--bg-sidebar) 0%, var(--bg-surface) 60%, var(--bg-surface) 100%)',
            border: '1px solid var(--divider-strong)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                lineHeight: 'var(--leading-normal)',
              }}
            >
              {hasDraft
                ? 'Your identity is ready. Copy the fields you need, or fill the signup form directly.'
                : 'Every display name, handle and address is checked against the ones already in your vault before it is handed over.'}
            </span>
          </div>

          <Segmented
            ariaLabel="Generation mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'single', label: 'Single' },
              { value: 'batch', label: 'Batch' },
            ]}
          />

          {mode === 'batch' ? (
            <SettingRow
              label="Accounts per run"
              description={`Between ${BATCH_MIN_COUNT} and ${BATCH_MAX_COUNT}. Each account spends one mailbox registration.`}
              control={
                <div className="Segmented" role="group" aria-label="Batch size">
                  {COUNT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={count === preset}
                      onClick={() => setCount(preset)}
                      className="Segmented__option"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              }
            />
          ) : null}

          {generator.busy ? <ProgressBar percent={generator.progress} /> : null}

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              block
              size="lg"
              loading={generator.busy}
              onClick={() => void generator.generate(mode === 'single' ? 1 : count)}
              icon={<Sparkles size={17} />}
            >
              {mode === 'single' ? 'Generate identity' : `Generate ${count} identities`}
            </Button>

            <Button
              variant="ghost"
              size="lg"
              disabled={generator.busy || !hasDraft}
              onClick={() => void generator.preview(1)}
              icon={<RefreshCw size={17} />}
              title="Re-roll without touching the network"
            >
              Re-roll
            </Button>

            <Button
              variant="ghost"
              size="lg"
              disabled={generator.busy || (!hasDraft && batchDrafts.length === 0)}
              onClick={() => setConfirmClearOpen(true)}
              icon={<Eraser size={17} />}
              title="Clear the generator"
            >
              Clear
            </Button>
          </div>
        </section>

        {draft ? (
          <IdentityCardView
            account={draft}
            clipboardClearSeconds={settings.clipboardClearSeconds}
            revealByDefault={settings.revealSecretsByDefault}
            onRegenerate={() => {
              setDraft(null);
              void generator.generate(1);
            }}
            onRegenerateField={(field) => void generator.regenerateField(draft, field)}
            regenerating={generator.regenerating}
            footer={
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button
                  block
                  variant="secondary"
                  onClick={() => void generator.fillPage(draft)}
                  icon={<Send size={15} />}
                >
                  Fill the current page
                </Button>
                <Button
                  variant="ghost"
                  disabled={generator.busy}
                  onClick={() => void generator.remintMailbox(draft.id)}
                  icon={<RefreshCw size={15} />}
                  title="Reserve a different mailbox for this identity"
                >
                  New mailbox
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmClearOpen(true)}
                  icon={<Trash2 size={15} />}
                  title="Clear the generator"
                >
                  Clear
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={<Sparkles size={24} />}
            title="Nothing generated yet"
            body="Press Generate to mint a unique display name, handle, birthday and a reserved temporary mailbox."
          />
        )}

        {batchDrafts.length > 1 ? (
          <section
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-xl)',
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--divider)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span className="SectionCard__icon" aria-hidden="true">
                <Layers size={16} />
              </span>
              <div className="SectionCard__heading" style={{ flex: '1 1 auto' }}>
                <h2 className="SectionCard__title">Batch queue</h2>
                <p className="SectionCard__description">
                  {batchDrafts.length} identities saved to the vault.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onOpenVault}>
                Open vault ({accountCount})
              </Button>
            </div>

            {batchDrafts.slice(0, 6).map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => setDraft(account)}
                className="ListRow"
                style={{ borderRadius: 'var(--radius-lg)', border: 'none' }}
              >
                <span className="ListRow__body">
                  <span className="ListRow__topLine">
                    <span className="ListRow__title">{account.discordDisplayName}</span>
                  </span>
                  <span className="ListRow__subtitle">{account.email}</span>
                </span>
                <Chip tone="accent">@{account.discordUsername}</Chip>
              </button>
            ))}

            {batchDrafts.length > 6 ? (
              <p className="Field__hint">…and {batchDrafts.length - 6} more in the vault.</p>
            ) : null}
          </section>
        ) : null}

        <section
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-1)',
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void generator.preview(1)}
            icon={<RefreshCw size={14} />}
          >
            Preview only
          </Button>
          <span className="Field__hint" style={{ flex: '1 1 auto' }}>
            Preview never contacts the mailbox service.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClearOpen(true)}
            disabled={!hasDraft && batchDrafts.length === 0}
            icon={<Trash2 size={14} />}
          >
            Clear generator
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear the generator?"
        description="This removes the identity on screen and the batch queue. Accounts already saved in the vault are not affected."
        confirmLabel="Clear generator"
        onConfirm={handleClear}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </>
  );
}
