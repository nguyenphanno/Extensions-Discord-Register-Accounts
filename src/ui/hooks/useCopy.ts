import { useCallback, useEffect } from 'react';
import { copyText } from '../lib/Clipboard';
import { useToast } from './useToast';
import { useUiStore } from '../state/UiStore';

export interface CopyApi {
  /**
   * Copies `value`, shows a confirmation toast, and arms the clipboard wipe.
   * `label` is what the user sees in the toast, e.g. `Discord password`.
   */
  copy: (value: string, label: string) => Promise<boolean>;
}

/**
 * Copy-to-clipboard with user feedback.
 *
 * The clipboard wipe is armed from Settings and tracked through the UI store so
 * the countdown chip survives a view change. We cannot verify what the
 * clipboard currently holds without a permission we deliberately do not
 * request, so the wipe is best-effort and the UI copy says so.
 */
export function useCopy(clipboardClearSeconds: number): CopyApi {
  const toast = useToast();
  const armClipboard = useUiStore((state) => state.armClipboard);
  const disarmClipboard = useUiStore((state) => state.disarmClipboard);

  const copy = useCallback(
    async (value: string, label: string) => {
      if (!value) {
        toast.warn('Nothing to copy', `${label} is empty.`);
        return false;
      }

      const succeeded = await copyText(value);

      if (!succeeded) {
        toast.error('Copy failed', 'Select the field and copy manually.');
        return false;
      }

      if (clipboardClearSeconds > 0) {
        armClipboard(clipboardClearSeconds);
        toast.success(`${label} copied`, `Clipboard clears in ${clipboardClearSeconds}s.`);
      } else {
        disarmClipboard();
        toast.success(`${label} copied`);
      }

      return true;
    },
    [armClipboard, clipboardClearSeconds, disarmClipboard, toast],
  );

  return { copy };
}

/**
 * Wipes the clipboard once the armed deadline passes.
 * Mounted once at the app root so it keeps running across view changes.
 */
export function useClipboardGuard(): void {
  const clipboardDeadline = useUiStore((state) => state.clipboardDeadline);
  const disarmClipboard = useUiStore((state) => state.disarmClipboard);

  // Pages that have no clipboard write permission simply no-op here.
  useEffect(() => {
    if (!clipboardDeadline) return;

    const remaining = clipboardDeadline - Date.now();
    if (remaining <= 0) {
      disarmClipboard();
      return;
    }

    const timer = setTimeout(() => {
      void copyText('').finally(disarmClipboard);
    }, remaining);

    return () => clearTimeout(timer);
  }, [clipboardDeadline, disarmClipboard]);
}
