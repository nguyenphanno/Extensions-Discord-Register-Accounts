import { create } from 'zustand';
import type { AccountRecord } from '../../shared/types/Account';

/** Top-level destinations; one per icon in the navigation rail. */
export type AppView = 'generator' | 'inbox' | 'vault' | 'register' | 'activity' | 'settings';

export const APP_VIEWS: readonly AppView[] = [
  'generator',
  'inbox',
  'vault',
  'register',
  'activity',
  'settings',
];

interface UiState {
  view: AppView;
  setView: (view: AppView) => void;

  /** Currently focused vault record, shared between list and detail panes. */
  selectedAccountId: string | null;
  selectedAccount: AccountRecord | null;
  selectAccount: (account: AccountRecord | null) => void;

  /** Latest generated-but-unsaved identity, shown on the generator screen. */
  draft: AccountRecord | null;
  setDraft: (draft: AccountRecord | null) => void;

  batchDrafts: AccountRecord[];
  setBatchDrafts: (drafts: AccountRecord[]) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  /** Epoch ms when the clipboard wipe fires; drives the countdown chip. */
  clipboardDeadline: number | null;
  armClipboard: (seconds: number) => void;
  disarmClipboard: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: 'generator',
  setView: (view) => set({ view }),

  selectedAccountId: null,
  selectedAccount: null,
  selectAccount: (account) =>
    set({ selectedAccount: account, selectedAccountId: account?.id ?? null }),

  draft: null,
  setDraft: (draft) => set({ draft }),

  batchDrafts: [],
  setBatchDrafts: (batchDrafts) => set({ batchDrafts }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),

  clipboardDeadline: null,
  armClipboard: (seconds) =>
    set({ clipboardDeadline: seconds > 0 ? Date.now() + seconds * 1000 : null }),
  disarmClipboard: () => set({ clipboardDeadline: null }),
}));
