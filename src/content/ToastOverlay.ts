import circleCheckIcon from 'lucide-static/icons/circle-check.svg?raw';
import circleAlertIcon from 'lucide-static/icons/circle-alert.svg?raw';
import infoIcon from 'lucide-static/icons/info.svg?raw';

/**
 * In-page toast for autofill feedback.
 *
 * Renders inside a shadow root so the host page's CSS cannot restyle it and our
 * styles cannot leak out. This is the only UI the content script draws; the
 * real interface lives in the popup and side panel.
 */

type ToastTone = 'success' | 'warning' | 'info';

const ICONS: Record<ToastTone, string> = {
  success: circleCheckIcon,
  warning: circleAlertIcon,
  info: infoIcon,
};

const HOST_ID = 'dra-toast-host';
const AUTO_DISMISS_MS = 3_600;

let hostElement: HTMLElement | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(title: string, detail: string, tone: ToastTone = 'success'): void {
  const root = ensureRoot();

  root.innerHTML = `
    <style>${STYLES}</style>
    <div class="card" role="status" aria-live="polite" data-tone="${tone}">
      <span class="icon" aria-hidden="true">${ICONS[tone]}</span>
      <span class="body">
        <span class="title"></span>
        <span class="detail"></span>
      </span>
      <span class="accent" aria-hidden="true"></span>
    </div>
  `;

  // Written as text content, never interpolated into the markup above, so a
  // page-controlled value can never become executable.
  root.querySelector('.title')!.textContent = title;
  root.querySelector('.detail')!.textContent = detail;

  const card = root.querySelector('.card') as HTMLElement;
  requestAnimationFrame(() => card.classList.add('visible'));

  if (dismissTimer !== null) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(hideToast, AUTO_DISMISS_MS);

  card.addEventListener('click', hideToast);
}

export function hideToast(): void {
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  const card = hostElement?.shadowRoot?.querySelector('.card');
  if (!card) return;

  card.classList.remove('visible');
  setTimeout(() => hostElement?.remove(), 220);
  hostElement = null;
}

function ensureRoot(): ShadowRoot {
  if (hostElement?.isConnected && hostElement.shadowRoot) {
    hostElement.remove();
  }

  hostElement = document.createElement('div');
  hostElement.id = HOST_ID;

  // Positioned above everything the page might stack, without ever taking
  // layout space or pointer events.
  hostElement.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:2147483647;pointer-events:none;';

  const shadow = hostElement.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(hostElement);

  return shadow;
}

/** Discord-flavoured tokens; kept in sync with the extension's palette. */
const STYLES = `
  :host { all: initial; }
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 280px;
    max-width: 380px;
    padding: 12px 14px;
    border-radius: 8px;
    background: #2b2d31;
    border: 1px solid #3f4147;
    box-shadow: 0 12px 32px rgba(0,0,0,.44), 0 2px 8px rgba(0,0,0,.3);
    font-family: 'gg sans','Inter','Segoe UI',system-ui,sans-serif;
    color: #f2f3f5;
    pointer-events: auto;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    opacity: 0;
    transform: translateY(-12px) scale(.97);
    transition: opacity .18s ease, transform .18s cubic-bezier(.2,.9,.3,1.2);
  }
  .card.visible { opacity: 1; transform: translateY(0) scale(1); }
  .icon { display: flex; flex: none; width: 20px; height: 20px; }
  .icon svg { width: 100%; height: 100%; }
  [data-tone="success"] .icon { color: #23a55a; }
  [data-tone="warning"] .icon { color: #f0b232; }
  [data-tone="info"]    .icon { color: #5865f2; }
  .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .title { font-size: 13.5px; font-weight: 600; line-height: 1.25; }
  .detail { font-size: 12px; color: #b5bac1; line-height: 1.35; }
  .accent {
    position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  }
  [data-tone="success"] .accent { background: #23a55a; }
  [data-tone="warning"] .accent { background: #f0b232; }
  [data-tone="info"]    .accent { background: #5865f2; }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: opacity .01ms linear; transform: none; }
  }
`;
