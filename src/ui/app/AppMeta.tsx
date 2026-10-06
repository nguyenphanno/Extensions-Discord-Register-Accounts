import type { ReactNode } from 'react';
import { Activity, Inbox, KeyRound, Settings, Sparkles, UserPlus } from 'lucide-react';
import type { AppView } from '../state/UiStore';

/** Rail metadata: label, icon and the shortcut hint shown in the tooltip. */
export const VIEW_META: Record<AppView, { label: string; icon: ReactNode; hint: string }> = {
  generator: { label: 'Generator', icon: <Sparkles size={18} />, hint: 'Ctrl+1' },
  inbox: { label: 'Inbox', icon: <Inbox size={18} />, hint: 'Ctrl+2' },
  vault: { label: 'Vault', icon: <KeyRound size={18} />, hint: 'Ctrl+3' },
  register: { label: 'Register', icon: <UserPlus size={18} />, hint: 'Ctrl+4' },
  activity: { label: 'Activity', icon: <Activity size={18} />, hint: 'Ctrl+5' },
  settings: { label: 'Settings', icon: <Settings size={18} />, hint: 'Ctrl+6' },
};

/** Copy for the scoped clear confirmations, kept next to the rail metadata. */
export const CLEAR_COPY = {
  accounts: {
    title: 'Clear every saved account?',
    description:
      'All stored credentials and identity fingerprints are removed. This cannot be undone.',
  },
  activity: {
    title: 'Clear the activity log?',
    description: 'The whole audit trail is deleted. This cannot be undone.',
  },
  settings: {
    title: 'Reset settings?',
    description: 'Every preference returns to its default value.',
  },
  everything: {
    title: 'Clear all extension data?',
    description:
      'Accounts, the activity log and settings are all deleted. Mailboxes stay alive on the server, but you will lose the credentials needed to reach them.',
  },
} as const;
