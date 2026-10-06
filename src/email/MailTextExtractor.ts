/**
 * Converts email HTML into readable plain text.
 * Used for inbox previews, for the "text mode" reader, and as the haystack the
 * verification-code scanner searches when `body_text` is missing.
 */
export function extractReadableText(html: string): string {
  if (!html) return '';

  const document = new DOMParser().parseFromString(html, 'text/html');

  document.querySelectorAll('script, style, head, noscript, template').forEach((node) => node.remove());

  // Block-level elements become line breaks before we collapse whitespace,
  // otherwise table-based marketing emails collapse into one unreadable line.
  document.querySelectorAll('br, p, div, tr, li, h1, h2, h3, h4, h5, h6').forEach((node) => {
    node.insertAdjacentText('afterend', '\n');
  });

  const text = document.body.textContent ?? '';
  return normalizeWhitespace(text);
}

/** Collapses runs of blank lines while preserving intentional paragraphing. */
export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Single-line preview for the message list. */
export function buildPreview(source: string, maxLength = 140): string {
  const collapsed = normalizeWhitespace(source).replace(/\n+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength).trimEnd()}…`;
}

/** Splits `Display Name <user@host>` into its two halves. */
export function parseFromHeader(fromAddress: string): { displayName: string; address: string } {
  const value = fromAddress.trim();
  const match = /^(.*?)<([^>]+)>\s*$/.exec(value);

  if (!match) return { displayName: value, address: value };

  const displayName = (match[1] ?? '').trim().replace(/^"|"$/g, '');
  const address = (match[2] ?? '').trim();

  return {
    displayName: displayName || address,
    address,
  };
}
