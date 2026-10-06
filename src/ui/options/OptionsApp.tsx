import { useState, type ReactNode } from 'react';
import { ExternalLink, KeyRound, Server, Sparkles, Wand2, HardDrive, Info, Activity } from 'lucide-react';
import type { VaultClearScope } from '../../shared/types/Messages';
import { APP_NAME, FALLBACK_DOMAINS } from '../../shared/constants/AppConstants';
import { Chip, IconButton } from '../components/Primitives';
import { ConfirmDialog, ToastHost } from '../components/Feedback';
import { CLEAR_COPY } from '../app/AppMeta';
import { SettingsView } from '../features/settings/SettingsView';
import { ActivityView } from '../features/activity/ActivityView';
import { useSettings } from '../hooks/useSettings';
import { useVault } from '../hooks/useVault';
import { useToast } from '../hooks/useToast';

type SectionId = 'service' | 'generator' | 'mailbox' | 'data' | 'activity' | 'about';

const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: 'service', label: 'Mailbox service', icon: <Server size={16} /> },
  { id: 'generator', label: 'Generator', icon: <Wand2 size={16} /> },
  { id: 'mailbox', label: 'Mailbox behaviour', icon: <Activity size={16} /> },
  { id: 'data', label: 'Storage & data', icon: <HardDrive size={16} /> },
  { id: 'activity', label: 'Audit log', icon: <Activity size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> },
];

/**
 * Full settings page.
 *
 * The left rail is a scroll-spy style index rather than real routing: settings
 * is one long form, and jumping to a section preserves the user's scroll
 * position in a way that tab-switching would not.
 */
export function OptionsApp(): ReactNode {
  const settings = useSettings();
  const vault = useVault();
  const toast = useToast();

  const [section, setSection] = useState<SectionId>('service');
  const [pendingClear, setPendingClear] = useState<VaultClearScope | null>(null);

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

  return (
    <div className="OptionsRoot">
      <header className="OptionsHero">
        <img
          className="OptionsHero__logo"
          src={chrome.runtime.getURL('icons/Icon128.png')}
          alt=""
        />

        <div className="OptionsHero__text">
          <h1 className="OptionsHero__title">{APP_NAME}</h1>
          <p className="OptionsHero__subtitle">
            Generate unique identities, reserve temporary mailboxes and keep every credential in a
            local vault. Nothing leaves this browser except the mailbox registrations you trigger.
          </p>

          <div className="OptionsHero__chips">
            <Chip tone="accent" icon={<Sparkles size={11} />}>
              v{chrome.runtime.getManifest().version}
            </Chip>
            <Chip icon={<KeyRound size={11} />}>{vault.stats.total} accounts stored</Chip>
            <Chip tone="muted">{FALLBACK_DOMAINS.length} offline fallback domains</Chip>
          </div>
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <IconButton
            label="Open the popup surface"
            onClick={() => window.close()}
            icon={<ExternalLink size={16} />}
          />
        </div>
      </header>

      <div className="OptionsBody">
        <nav className="OptionsNav" aria-label="Settings sections">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSection(entry.id)}
              aria-current={section === entry.id ? 'true' : undefined}
              className={`OptionsNav__item${section === entry.id ? ' OptionsNav__item--active' : ''}`}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </nav>

        <main style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 }}>
          {section === 'activity' ? (
            <ActivityView
              confirmDestructive={settings.settings.confirmDestructiveActions}
              onRequestClear={() => setPendingClear('activity')}
            />
          ) : (
            <SettingsView
              settings={settings.settings}
              loading={settings.loading}
              update={settings.update}
              reset={settings.reset}
              onRequestClear={(scope) => setPendingClear(scope)}
            />
          )}
        </main>
      </div>

      <footer className="OptionsFooter">
        {APP_NAME} · local-first · no telemetry · mailbox registrations go only to{' '}
        {settings.settings.apiBaseUrl}
      </footer>

      <ConfirmDialog
        open={pendingClear !== null}
        title={pendingClear ? CLEAR_COPY[pendingClear].title : ''}
        description={pendingClear ? CLEAR_COPY[pendingClear].description : ''}
        confirmLabel="Clear"
        onConfirm={() => pendingClear && void runClear(pendingClear)}
        onCancel={() => setPendingClear(null)}
      />

      <ToastHost />
    </div>
  );
}
