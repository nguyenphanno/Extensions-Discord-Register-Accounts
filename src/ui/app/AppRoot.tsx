import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { AccountRecord } from '../../shared/types/Account';
import type { VaultClearScope } from '../../shared/types/Messages';
import { APP_NAME, COMMAND_PALETTE_HOTKEY } from '../../shared/constants/AppConstants';
import { AppShell, NavRail, NavRailItem, PanelHeader, Pane } from '../components/AppShell';
import { CommandPalette } from '../components/CommandPalette';
import { ClipboardCountdown } from '../components/ClipboardCountdown';
import { ConfirmDialog, ToastHost } from '../components/Feedback';
import { IconButton, Tooltip } from '../components/Primitives';
import { useActivity } from '../hooks/useActivity';
import { useClipboardGuard } from '../hooks/useCopy';
import { displayCombo } from '../hooks/useHotkey';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../hooks/useToast';
import { useVault } from '../hooks/useVault';
import { APP_VIEWS, useUiStore, type AppView } from '../state/UiStore';
import { ActivityView } from '../features/activity/ActivityView';
import { GeneratorView } from '../features/generator/GeneratorView';
import { InboxView } from '../features/inbox/InboxView';
import { RegisterView } from '../features/register/RegisterView';
import { VaultView } from '../features/vault/VaultView';
import { CLEAR_COPY, VIEW_META } from './AppMeta';
import { useAppCommands } from './useAppCommands';
import { useAppHotkeys } from './useAppHotkeys';

export interface AppRootProps {
  /** Surface-specific buttons injected into the header. */
  headerActions?: ReactNode;
  /** Surface-specific status strip rendered under the shell. */
  statusBar?: ReactNode;
  /**
   * Popup drops the logo/subtitle from the header because the 400px viewport
   * cannot fit them without truncating the title.
   */
  variant?: 'popup' | 'panel';
}

/**
 * The shared application shell.
 *
 * Both the popup and the side panel render this, which is what keeps the two
 * surfaces identical without duplicating any wiring. Everything that differs
 * arrives through `headerActions` and `statusBar`.
 *
 * Layout contract: the root is `position: fixed; inset: 0` so it always matches
 * the real viewport, and every flex child below it carries `min-height: 0`.
 * A `height: 100%` chain was tried first and collapsed to zero once more than
 * two flex levels were involved, which rendered the surfaces as a bare header.
 */
export function AppRoot({
  headerActions,
  statusBar,
  variant = 'panel',
}: AppRootProps): ReactNode {
  const settings = useSettings();
  const vault = useVault();
  const activity = useActivity(50);
  const toast = useToast();

  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const selectedAccount = useUiStore((state) => state.selectedAccount);
  const selectAccount = useUiStore((state) => state.selectAccount);
  const draft = useUiStore((state) => state.draft);
  const setDraft = useUiStore((state) => state.setDraft);
  const paletteOpen = useUiStore((state) => state.commandPaletteOpen);
  const setPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);

  const [pendingClear, setPendingClear] = useState<VaultClearScope | null>(null);

  useClipboardGuard();

  const goTo = useCallback((next: AppView) => setView(next), [setView]);
  const openPalette = useCallback(() => setPaletteOpen(true), [setPaletteOpen]);
  const openSettings = useCallback(() => setView('settings'), [setView]);

  const commands = useAppCommands({
    accounts: vault.accounts,
    goTo,
    openPalette,
    clearGenerator: () => {
      setDraft(null);
      toast.info('Cleared', 'The generator has been reset.');
    },
    openSettings,
  });

  useAppHotkeys({ openPalette, goTo });

  // Surface-level keyboard shortcut hints are easiest to document in the log
  // once per mount rather than in every tooltip.
  useEffect(() => {
    void activity.reloadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runClear(scope: VaultClearScope): Promise<void> {
    try {
      if (scope === 'settings') await settings.reset();
      else await vault.clear(scope);

      if (scope === 'everything') await settings.reload();
      toast.success('Cleared', `${scope} data removed.`);
    } catch (error) {
      toast.error('Clear failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setPendingClear(null);
    }
  }

  const headerSubtitle =
    view === 'vault'
      ? `${vault.stats.total} saved account${vault.stats.total === 1 ? '' : 's'}`
      : view === 'activity'
        ? `${activity.stats.total} event${activity.stats.total === 1 ? '' : 's'}`
        : APP_NAME;

  const isPopup = variant === 'popup';

  return (
    <>
      <AppShell
        rail={
          <NavRail
            footer={
              <Tooltip text={`Command palette (${displayCombo(COMMAND_PALETTE_HOTKEY)})`}>
                <NavRailItem
                  label="Command palette"
                  icon={<Sparkles size={18} />}
                  active={false}
                  onClick={openPalette}
                />
              </Tooltip>
            }
          >
            {isPopup ? (
              <img
                src={chrome.runtime.getURL('icons/Icon32.png')}
                alt=""
                width={30}
                height={30}
                style={{ borderRadius: 10, marginBottom: 2 }}
              />
            ) : null}

            <div className="NavRail__divider" />

            {APP_VIEWS.map((id) => (
              <Tooltip key={id} text={`${VIEW_META[id].label} (${VIEW_META[id].hint})`}>
                <NavRailItem
                  label={VIEW_META[id].label}
                  icon={VIEW_META[id].icon}
                  active={view === id}
                  badge={id === 'vault' ? vault.stats.total : undefined}
                  onClick={() => setView(id)}
                />
              </Tooltip>
            ))}
          </NavRail>
        }
        statusBar={statusBar}
      >
        <PanelHeader
          title={VIEW_META[view].label}
          subtitle={headerSubtitle}
          logoUrl={chrome.runtime.getURL('icons/Icon32.png')}
          compact={isPopup}
          actions={
            <>
              <ClipboardCountdown />
              {headerActions}
              <Tooltip text={`Command palette (${displayCombo(COMMAND_PALETTE_HOTKEY)})`}>
                <IconButton
                  label="Open the command palette"
                  onClick={openPalette}
                  icon={<Sparkles size={16} />}
                />
              </Tooltip>
            </>
          }
        />

        <Pane>
          {view === 'generator' ? (
            <GeneratorView
              settings={settings.settings}
              accountCount={vault.stats.total}
              onOpenVault={() => setView('vault')}
            />
          ) : null}

          {view === 'inbox' ? (
            <InboxView
              accounts={vault.accounts}
              selectedAccount={selectedAccount}
              onSelectAccount={(account: AccountRecord) => selectAccount(account)}
              loadRemoteImages={settings.settings.loadRemoteMailImages}
              clipboardClearSeconds={settings.settings.clipboardClearSeconds}
              onSwitchToVault={() => setView('vault')}
            />
          ) : null}

          {view === 'vault' ? (
            <VaultView
              revealByDefault={settings.settings.revealSecretsByDefault}
              clipboardClearSeconds={settings.settings.clipboardClearSeconds}
              confirmDestructive={settings.settings.confirmDestructiveActions}
              selectedAccountId={selectedAccount?.id ?? null}
              onSelectAccount={selectAccount}
            />
          ) : null}

          {view === 'register' ? (
            <RegisterView
              account={selectedAccount ?? draft ?? vault.accounts[0] ?? null}
              clipboardClearSeconds={settings.settings.clipboardClearSeconds}
              revealByDefault={settings.settings.revealSecretsByDefault}
              onGenerate={() => setView('generator')}
            />
          ) : null}

          {view === 'activity' ? (
            <ActivityView
              confirmDestructive={settings.settings.confirmDestructiveActions}
              onRequestClear={() => setPendingClear('activity')}
            />
          ) : null}
        </Pane>
      </AppShell>

      <CommandPalette open={paletteOpen} items={commands} onClose={() => setPaletteOpen(false)} />

      <ConfirmDialog
        open={pendingClear !== null}
        title={pendingClear ? CLEAR_COPY[pendingClear].title : ''}
        description={pendingClear ? CLEAR_COPY[pendingClear].description : ''}
        confirmLabel="Clear"
        onConfirm={() => pendingClear && void runClear(pendingClear)}
        onCancel={() => setPendingClear(null)}
      />

      <ToastHost />
    </>
  );
}
