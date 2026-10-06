import { useEffect } from 'react';

export interface HotkeyBinding {
  /** Either a single key (`Escape`) or a chord (`Ctrl+K`, `Shift+Enter`). */
  combo: string;
  handler: (event: KeyboardEvent) => void;
  /** Fire even while a text input has focus. Defaults to false. */
  allowInInput?: boolean;
  enabled?: boolean;
}

/**
 * Global keyboard shortcuts.
 *
 * Bindings are matched against a normalised chord string so call sites read the
 * way a user thinks about the shortcut. Events that originate from a text field
 * are ignored unless explicitly allowed, which is what stops `Ctrl+K` from
 * eating keystrokes while the user is typing.
 */
export function useHotkey(bindings: readonly HotkeyBinding[]): void {
  useEffect(() => {
    const active = bindings.filter((binding) => binding.enabled !== false);
    if (active.length === 0) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      const combo = describeEvent(event);

      for (const binding of active) {
        if (normalise(binding.combo) !== combo) continue;
        if (!binding.allowInInput && isTextEntry(event.target)) continue;

        event.preventDefault();
        binding.handler(event);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings]);
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/** Renders an event as `Ctrl+Shift+K`, matching the binding syntax. */
function describeEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);

  return normalise(parts.join('+'));
}

/** Accepts `cmd`, `ctrl`, `mod`, `option` and normalises to `Ctrl`. */
function normalise(combo: string): string {
  return combo
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lowered = part.toLowerCase();
      if (lowered === 'cmd' || lowered === 'meta' || lowered === 'mod') return 'Ctrl';
      if (lowered === 'ctrl' || lowered === 'control') return 'Ctrl';
      if (lowered === 'alt' || lowered === 'option') return 'Alt';
      if (lowered === 'shift') return 'Shift';
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join('+');
}

/** Display form for the UI, e.g. `Ctrl + K`. */
export function displayCombo(combo: string): string {
  return normalise(combo).split('+').join(' + ');
}
