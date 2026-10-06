import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, Settings2 } from 'lucide-react';
import { IconButton, StatusDot, Tooltip } from '../components/Primitives';
import { AppRoot } from '../app/AppRoot';
import { useSettings } from '../hooks/useSettings';
import { useVault } from '../hooks/useVault';

/**
 * Popup surface.
 *
 * Fixed at 400x600 - Chrome's maximum popup viewport - so the layout never gets
 * a scrollbar it did not ask for. The status bar at the bottom surfaces the two
 * facts a user needs at a glance: whether the mailbox service is reachable and
 * how much is stored locally.
 */
export function PopupApp(): ReactNode {
  const settings = useSettings();
  const vault = useVault();

  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => {
    const notifyClosed = (): void => {
      void chrome.runtime.sendMessage({ type: 'launcher/notifyClosed' }).catch(() => undefined);
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') notifyClosed();
    };

    window.addEventListener('beforeunload', notifyClosed);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('beforeunload', notifyClosed);
      document.removeEventListener('visibilitychange', onVisibility);
      notifyClosed();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const probe = async (): Promise<void> => {
      try {
        const response = await fetch(`${settings.settings.apiBaseUrl.replace(/\/+$/, '')}/domains`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!cancelled) setApiReachable(response.ok);
      } catch {
        if (!cancelled) setApiReachable(false);
      }
    };

    void probe();
    return () => {
      cancelled = true;
    };
  }, [settings.settings.apiBaseUrl]);

  return (
    <div className="PopupRoot">
      <AppRoot
        variant="popup"
        headerActions={
          <Tooltip text="Open the full settings page">
            <IconButton
              label="Open the full settings page"
              onClick={() => void chrome.runtime.openOptionsPage()}
              icon={<Settings2 size={16} />}
            />
          </Tooltip>
        }
        statusBar={
          <div className="PopupStatusBar">
            <StatusDot
              tone={apiReachable === true ? 'online' : apiReachable === false ? 'busy' : 'idle'}
              pulse={apiReachable === null}
              title={
                apiReachable === true
                  ? 'Mailbox service reachable'
                  : apiReachable === false
                    ? 'Mailbox service unreachable'
                    : 'Checking the mailbox service…'
              }
            />
            <span>
              {apiReachable === true
                ? 'Service online'
                : apiReachable === false
                  ? 'Service offline'
                  : 'Checking…'}
            </span>

            <span className="PopupStatusBar__spacer" />

            <span>
              {vault.stats.total} account{vault.stats.total === 1 ? '' : 's'}
            </span>

            <Tooltip text="Open the side panel for a wider view">
              <IconButton
                label="Open this extension in the side panel"
                onClick={() => {
                  void chrome.windows
                    .getCurrent()
                    .then((win) => (win.id ? chrome.sidePanel.open({ windowId: win.id }) : undefined))
                    .catch(() => undefined);
                }}
                icon={<ExternalLink size={14} />}
              />
            </Tooltip>
          </div>
        }
      />
    </div>
  );
}
