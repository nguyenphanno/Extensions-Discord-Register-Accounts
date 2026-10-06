import { useEffect, type ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { IconButton, Tooltip } from '../components/Primitives';
import { AppRoot } from '../app/AppRoot';

/**
 * Side-panel surface.
 *
 * Same shell as the popup, but it owns the full viewport height and has room
 * for the two-column inbox/vault layouts. Using the panel is the intended way
 * to work through a batch, since the popup closes the moment focus moves to
 * the page you are filling in.
 */
export function PanelApp(): ReactNode {
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

  return (
    <div className="PanelRoot">
      <AppRoot
        headerActions={
          <Tooltip text="Open the full settings page">
            <IconButton
              label="Open the full settings page"
              onClick={() => void chrome.runtime.openOptionsPage()}
              icon={<Settings2 size={16} />}
            />
          </Tooltip>
        }
      />
    </div>
  );
}
