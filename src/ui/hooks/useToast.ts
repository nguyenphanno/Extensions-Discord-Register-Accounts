import { useCallback, useMemo } from 'react';
import { useToastStore, type ToastTone } from '../state/ToastStore';
import { TOAST_DURATION_MS } from '../../shared/constants/AppConstants';

export interface ToastApi {
  info: (title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  warn: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  /**
   * Progress channel for long flows: successive messages sharing a `key`
   * refresh one card instead of filling the stack.
   */
  progress: (key: string, title: string, message?: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

/**
 * Imperative toast API.
 *
 * Auto-dismiss is scheduled for non-error tones only: an error usually carries
 * something the user needs to read and act on, so it stays until dismissed.
 */
export function useToast(): ToastApi {
  const push = useToastStore((state) => state.push);
  const dismiss = useToastStore((state) => state.dismiss);
  const clear = useToastStore((state) => state.clear);

  const emit = useCallback(
    (tone: ToastTone, title: string, message = '', key?: string) => {
      const id = push({ tone, title, message, ...(key ? { key } : {}) });

      if (tone !== 'error') {
        setTimeout(() => useToastStore.getState().dismiss(id), TOAST_DURATION_MS);
      }
    },
    [push],
  );

  return useMemo<ToastApi>(
    () => ({
      info: (title, message) => emit('info', title, message),
      success: (title, message) => emit('success', title, message),
      warn: (title, message) => emit('warning', title, message),
      error: (title, message) => emit('error', title, message),
      progress: (key, title, message) => emit('info', title, message, key),
      dismiss,
      clear,
    }),
    [emit, dismiss, clear],
  );
}
