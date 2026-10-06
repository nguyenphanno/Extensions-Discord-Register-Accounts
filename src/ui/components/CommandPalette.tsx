import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { cx } from '../lib/ClassNames';
import { displayCombo } from '../hooks/useHotkey';
import { COMMAND_PALETTE_HOTKEY } from '../../shared/constants/AppConstants';

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  items: readonly CommandItem[];
  onClose: () => void;
}

/**
 * `Ctrl+K` command palette.
 *
 * Keyboard handling is the whole point: arrow navigation, Enter to run and
 * Escape to dismiss all work without touching the mouse. Filtering is a simple
 * substring match across label, group and keywords - fast enough that no
 * debounce is needed for a list this size.
 */
export function CommandPalette({ open, items, onClose }: CommandPaletteProps): ReactNode {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => filterItems(items, query), [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const bucket = map.get(item.group) ?? [];
      bucket.push(item);
      map.set(item.group, bucket);
    }
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    // Focus after paint so the caret lands inside the freshly mounted input.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const runActive = useCallback(() => {
    const item = filtered[activeIndex];
    if (!item) return;
    item.run();
    onClose();
  }, [activeIndex, filtered, onClose]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => (filtered.length === 0 ? 0 : (current + 1) % filtered.length));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) =>
          filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length,
        );
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        runActive();
      }
    },
    [filtered.length, onClose, runActive],
  );

  if (!open) return null;

  let flatIndex = -1;

  return createPortal(
    <div
      className="CommandPalette__scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="CommandPalette"
        onKeyDown={onKeyDown}
      >
        <div className="CommandPalette__search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions, accounts and settings…"
            aria-label="Search commands"
            className="CommandPalette__input"
          />
          <kbd>{displayCombo(COMMAND_PALETTE_HOTKEY)}</kbd>
        </div>

        <div className="CommandPalette__list" role="listbox" aria-label="Commands">
          {grouped.length === 0 ? (
            <p className="CommandPalette__empty">No matching commands.</p>
          ) : (
            grouped.map(([group, groupItems]) => (
              <div key={group}>
                <div className="CommandPalette__group">{group}</div>

                {groupItems.map((item) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => {
                        item.run();
                        onClose();
                      }}
                      className={cx(
                        'CommandPalette__item',
                        isActive ? 'CommandPalette__item--active' : null,
                      )}
                    >
                      <span className="CommandPalette__itemIcon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="CommandPalette__itemLabel">{item.label}</span>
                      {item.hint ? (
                        <span className="CommandPalette__itemHint">{item.hint}</span>
                      ) : null}
                      {isActive ? <CornerDownLeft size={13} aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Substring match across label, group and keywords, with a prefix boost. */
function filterItems(items: readonly CommandItem[], query: string): CommandItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];

  const scored: { item: CommandItem; score: number }[] = [];

  for (const item of items) {
    const label = item.label.toLowerCase();
    const haystack = `${label} ${item.group.toLowerCase()} ${item.keywords ?? ''}`;

    if (!haystack.includes(needle)) continue;

    const score = label.startsWith(needle) ? 2 : label.includes(needle) ? 1 : 0;
    scored.push({ item, score });
  }

  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.item);
}

/** Builds the standard "navigate to view" entries for a surface. */
export function createNavigationCommands(
  views: readonly { id: string; label: string; icon: ReactNode }[],
  onSelect: (id: string) => void,
): CommandItem[] {
  return views.map((view) => ({
    id: `nav:${view.id}`,
    label: `Go to ${view.label}`,
    group: 'Navigate',
    icon: view.icon,
    keywords: view.id,
    run: () => onSelect(view.id),
  }));
}
