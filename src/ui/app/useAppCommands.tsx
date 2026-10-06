import { useMemo } from 'react';
import { KeyRound, Sparkles, Trash2 } from 'lucide-react';
import type { AccountRecord } from '../../shared/types/Account';
import { COMMAND_PALETTE_HOTKEY } from '../../shared/constants/AppConstants';
import { createNavigationCommands, type CommandItem } from '../components/CommandPalette';
import { displayCombo } from '../hooks/useHotkey';
import { APP_VIEWS, type AppView } from '../state/UiStore';
import { VIEW_META } from './AppMeta';

export interface AppCommandOptions {
  accounts: readonly AccountRecord[];
  goTo: (view: AppView) => void;
  openPalette: () => void;
  clearGenerator: () => void;
  openSettings: () => void;
}

/**
 * Builds the `Ctrl+K` palette contents.
 *
 * Accounts are included so the palette doubles as a fast switcher: typing a
 * display name is meaningfully quicker than scanning the vault list when there
 * are dozens of records.
 */
export function useAppCommands({
  accounts,
  goTo,
  openPalette,
  clearGenerator,
  openSettings,
}: AppCommandOptions): CommandItem[] {
  return useMemo(() => {
    const navigation = createNavigationCommands(
      APP_VIEWS.map((id) => ({ id, label: VIEW_META[id].label, icon: VIEW_META[id].icon })),
      (id) => goTo(id as AppView),
    );

    const actions: CommandItem[] = [
      {
        id: 'action:palette',
        label: 'Open the command palette',
        group: 'Actions',
        icon: <Sparkles size={15} />,
        hint: displayCombo(COMMAND_PALETTE_HOTKEY),
        run: openPalette,
      },
      {
        id: 'action:clear-generator',
        label: 'Clear the generator',
        group: 'Actions',
        icon: <Trash2 size={15} />,
        run: clearGenerator,
      },
      {
        id: 'action:settings',
        label: 'Open settings',
        group: 'Actions',
        icon: <KeyRound size={15} />,
        run: openSettings,
      },
    ];

    const accountItems = accounts.slice(0, 15).map<CommandItem>((account) => ({
      id: `account:${account.id}`,
      label: `${account.discordDisplayName} — ${account.email || 'no mailbox'}`,
      group: 'Accounts',
      icon: <KeyRound size={15} />,
      keywords: `${account.discordUsername} ${account.tags.join(' ')}`,
      run: () => goTo('vault'),
    }));

    return [...navigation, ...actions, ...accountItems];
  }, [accounts, clearGenerator, goTo, openPalette, openSettings]);
}
