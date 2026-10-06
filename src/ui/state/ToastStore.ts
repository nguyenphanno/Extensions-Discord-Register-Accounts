import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastRecord {
  id: string;
  tone: ToastTone;
  title: string;
  message: string;
  createdAt: number;
  /** Sticky toasts ignore the auto-dismiss timer. */
  sticky: boolean;
  /** Optional identity used to refresh one card instead of stacking another. */
  key?: string;
}

export interface ToastInput {
  tone: ToastTone;
  title: string;
  message?: string;
  sticky?: boolean;
  key?: string;
}

interface ToastState {
  toasts: ToastRecord[];
  /** Returns the toast id, or the refreshed id when an existing card was updated. */
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/** Newest-first ordering, capped so a burst cannot bury the interface. */
const MAX_TOASTS = 5;

/**
 * A multi-step flow reports the same title over and over ("Filling…"). Inside
 * this window an identical card is updated in place instead of stacking, which
 * is what makes progress readable rather than a wall of duplicates.
 */
const REPLACE_WINDOW_MS = 1_200;

let counter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (input) => {
    counter += 1;
    const newId = `toast_${Date.now().toString(36)}_${counter}`;
    const sticky = input.sticky ?? input.tone === 'error';

    set((state) => {
      const existingId = findReplaceableId(state.toasts, input, sticky);

      if (existingId) {
        const refreshed = state.toasts.map((toast) =>
          toast.id === existingId
            ? { ...toast, message: input.message ?? '', createdAt: Date.now() }
            : toast,
        );
        return { toasts: refreshed };
      }

      const record: ToastRecord = {
        id: newId,
        tone: input.tone,
        title: input.title,
        message: input.message ?? '',
        createdAt: Date.now(),
        sticky,
        ...(input.key ? { key: input.key } : {}),
      };

      return { toasts: [record, ...state.toasts].slice(0, MAX_TOASTS) };
    });

    return findReplaceableId(get().toasts, input, sticky) ?? newId;
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

/** The id of a card this toast should refresh, if any. */
function findReplaceableId(
  toasts: readonly ToastRecord[],
  input: ToastInput,
  sticky: boolean,
): string | null {
  // A sticky toast is a deliberate "read this" message; never fold new content
  // into it or dismiss it on a timer meant for a different card.
  if (sticky) return null;

  const match = input.key
    ? toasts.find((toast) => toast.key === input.key)
    : toasts.find((toast) => toast.title === input.title && toast.tone === input.tone);

  if (!match) return null;
  return Date.now() - match.createdAt < REPLACE_WINDOW_MS ? match.id : null;
}

