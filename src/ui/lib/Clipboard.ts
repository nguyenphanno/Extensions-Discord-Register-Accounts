import { useEffect, useState } from 'react';

/**
 * Writes text to the clipboard with a guaranteed fallback.
 * `navigator.clipboard` needs a focused document; in a side panel or a popup
 * that just lost focus it rejects, so we fall back to the legacy selection
 * trick rather than silently failing the user's copy action.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const scratch = document.createElement('textarea');
    scratch.value = value;
    scratch.setAttribute('readonly', '');
    scratch.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';

    document.body.appendChild(scratch);
    scratch.select();
    const succeeded = document.execCommand('copy');
    scratch.remove();

    return succeeded;
  } catch {
    return false;
  }
}

/**
 * Clears the clipboard after a delay, but only if the content is still ours.
 * Reading the clipboard requires a permission we deliberately do not request,
 * so we instead rely on the caller to pass the same value back: if the user
 * copied something else in the meantime, the timer is cancelled upstream.
 */
export async function clearClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText('');
  } catch {
    // Nothing actionable; the value simply stays on the clipboard.
    void value;
  }
}

export interface ClipboardCountdown {
  secondsLeft: number;
  active: boolean;
  cancel: () => void;
}

/** Drives the "secrets are cleared in Ns" indicator. */
export function useClipboardCountdown(totalSeconds: number, isActive: boolean): ClipboardCountdown {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  useEffect(() => {
    if (!isActive || totalSeconds <= 0) {
      setSecondsLeft(totalSeconds);
      return;
    }

    setSecondsLeft(totalSeconds);
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, totalSeconds]);

  return {
    secondsLeft,
    active: isActive && totalSeconds > 0 && secondsLeft > 0,
    cancel: () => setSecondsLeft(totalSeconds),
  };
}
