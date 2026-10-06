import { useEffect, useState, type ReactNode } from 'react';
import { Eraser } from 'lucide-react';
import { useUiStore } from '../state/UiStore';
import { formatCountdown } from '../lib/FormatDate';

/**
 * Live clipboard countdown.
 *
 * Rendered in the header of every surface so the user always knows how long a
 * copied password is still sitting on the clipboard. Ticks off `Date.now()`
 * against a stored deadline rather than counting down a local state value, so
 * it stays accurate even after the view re-renders.
 */
export function ClipboardCountdown(): ReactNode {
  const deadline = useUiStore((state) => state.clipboardDeadline);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return;
    }

    const tick = (): void => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();

    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [deadline]);

  if (!deadline || remaining <= 0) return null;

  return (
    <span
      className="ClipboardPill"
      title="Copied secrets are wiped from the clipboard when this reaches zero"
    >
      <Eraser size={13} aria-hidden="true" />
      <span className="ClipboardPill__time">{formatCountdown(remaining)}</span>
      <span className="ClipboardPill__label">to wipe</span>
    </span>
  );
}