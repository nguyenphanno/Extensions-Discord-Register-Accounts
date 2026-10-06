import DOMPurify from 'dompurify';

/**
 * Sanitizes untrusted email HTML before it reaches the renderer.
 *
 * Threat model: `body_html` is attacker-controlled. Verification emails are a
 * classic XSS delivery vector, so sanitization happens in layers:
 *
 *   1. DOMPurify - handles mutation-XSS and the entire known-bypass surface,
 *      which a hand-rolled tag stripper reliably gets wrong.
 *   2. A remote-content policy on top of the sanitized output: remote images
 *      are suppressed unless the user opts in, which also neutralises the
 *      tracking pixels senders embed in verification mail.
 *
 * The React layer renders the result inside a sandboxed iframe without
 * `allow-scripts`, so even a sanitizer bypass cannot execute code.
 */

const ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup',
  'dd', 'del', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'h1',
  'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark',
  'ol', 'p', 'pre', 'q', 's', 'samp', 'small', 'span', 'strike', 'strong',
  'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var',
];

const ALLOWED_ATTRIBUTES = [
  'href', 'src', 'alt', 'title', 'width', 'height', 'align', 'valign', 'colspan',
  'rowspan', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'color', 'face',
  'size', 'style', 'dir', 'lang', 'target', 'rel',
];

/** Substrings that must never appear in a surviving URL attribute. */
const DANGEROUS_URL = /^\s*(?:javascript|vbscript|file)\s*:/i;

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface SanitizeOptions {
  /** When false, `http(s)` image sources are replaced with an inert pixel. */
  allowRemoteImages: boolean;
  /** Inline `cid:` images resolved from the message's `inline_images` map. */
  inlineImages?: Record<string, string>;
}

export interface SanitizeResult {
  html: string;
  /** Remote resources suppressed, surfaced to the user under the reader. */
  blockedRemoteCount: number;
  warnings: string[];
}

export function sanitizeMailHtml(rawHtml: string, options: SanitizeOptions): SanitizeResult {
  const warnings: string[] = [];

  if (!rawHtml || !rawHtml.trim()) {
    return { html: '', blockedRemoteCount: 0, warnings };
  }

  const purified = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'form', 'input', 'button', 'svg', 'math', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcset', 'formaction', 'xlink:href', 'action', 'ping', 'background'],
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
    SANITIZE_DOM: true,
    WHOLE_DOCUMENT: false,
  }) as string;

  return applyContentPolicy(purified, options, warnings);
}

/**
 * Second pass over already-sanitized markup. Runs on trusted-shaped HTML, so a
 * DOM walk here is safe - the input can no longer contain scriptable content.
 */
function applyContentPolicy(html: string, options: SanitizeOptions, warnings: string[]): SanitizeResult {
  const document = new DOMParser().parseFromString(html, 'text/html');
  let blockedRemoteCount = 0;

  document.querySelectorAll('a[href]').forEach((anchor) => {
    const href = (anchor.getAttribute('href') ?? '').trim();
    if (DANGEROUS_URL.test(href) || !/^(https?:|mailto:)/i.test(href)) {
      anchor.removeAttribute('href');
      return;
    }
    // Every surviving link opens detached from the extension context.
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer nofollow');
  });

  document.querySelectorAll('img').forEach((image) => {
    const source = (image.getAttribute('src') ?? '').trim();

    if (source.startsWith('cid:')) {
      const resolved = options.inlineImages?.[source.slice(4)];
      if (resolved) {
        image.setAttribute('src', resolved);
      } else {
        image.setAttribute('src', TRANSPARENT_PIXEL);
        blockedRemoteCount += 1;
      }
      return;
    }

    if (source.startsWith('data:image/')) return;

    if (!options.allowRemoteImages) {
      image.setAttribute('data-blockedSrc', source);
      image.setAttribute('src', TRANSPARENT_PIXEL);
      blockedRemoteCount += 1;
      return;
    }

    if (!/^https:/i.test(source)) {
      image.removeAttribute('src');
      blockedRemoteCount += 1;
    }
  });

  if (blockedRemoteCount > 0) {
    warnings.push(`${blockedRemoteCount} remote image(s) blocked.`);
  }

  return { html: document.body.innerHTML, blockedRemoteCount, warnings };
}

/** True when the message contains remote images the policy suppressed. */
export function hasBlockedRemoteContent(html: string): boolean {
  return html.includes('data-blockedSrc=');
}

