import { useMemo } from 'react';
import { COMMAND_PALETTE_HOTKEY } from '../../shared/constants/AppConstants';
import { useHotkey, type HotkeyBinding } from '../hooks/useHotkey';
import { APP_VIEWS, type AppView } from '../state/UiStore';

export interface HotkeyOptions {
  openPalette: () => void;
  goTo: (view: AppView) => void;
}

/**
 * Registers the app-wide shortcuts.
 *
 * `Ctrl+1..6` jump between rail destinations in declaration order, so adding a
 * view to `APP_VIEWS` automatically assigns it the next number.
 */
export function useAppHotkeys({ openPalette, goTo }: HotkeyOptions): void {
  const bindings = useMemo<HotkeyBinding[]>(() => {
    const navigation = APP_VIEWS.map((view, index) => ({
      combo: `Ctrl+${index + 1}`,
      handler: () => goTo(view),
    }));

    return [
      // Allowed inside inputs: `Ctrl+K` is a global affordance, not a typing key.
      { combo: COMMAND_PALETTE_HOTKEY, handler: openPalette, allowInInput: true },
      ...navigation,
    ];
  }, [goTo, openPalette]);

  useHotkey(bindings);
}
