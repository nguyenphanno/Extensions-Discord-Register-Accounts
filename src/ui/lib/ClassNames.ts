/** Joins conditional class names; falsy entries are dropped. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * BEM-ish block/element/modifier helper.
 * `bem('Button', { primary: true, sm: isSmall })` -> `Button Button--primary Button--sm`
 */
export function bem(
  block: string,
  modifiers: Record<string, boolean | undefined> = {},
): string {
  const active = Object.entries(modifiers)
    .filter(([, on]) => on === true)
    .map(([name]) => `${block}--${name}`);

  return [block, ...active].join(' ');
}

/** Element name inside a block: `el('Field', 'label')` -> `Field__label`. */
export function el(block: string, element: string): string {
  return `${block}__${element}`;
}
