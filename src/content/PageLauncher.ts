import type { LauncherOpenResult } from '../shared/types/Messages';
import { showToast } from './ToastOverlay';
import userPlusIcon from 'lucide-static/icons/user-round-plus.svg?raw';
import panelRightIcon from 'lucide-static/icons/panel-right-open.svg?raw';
import windowIcon from 'lucide-static/icons/square.svg?raw';
import clipboardIcon from 'lucide-static/icons/clipboard-paste.svg?raw';
import keyIcon from 'lucide-static/icons/key-round.svg?raw';

/**
 * Floating launcher injected into the page.
 *
 * Lives in a closed shadow root so Discord CSS cannot restyle it. After a
 * successful open of the panel/popup the pill hides (keeps host + drag position)
 * and reappears when the UI closes — or after an 8s fallback if close is missed.
 */

export type LauncherEdge = 'right' | 'left';

export interface LauncherOptions {
  edge: LauncherEdge;
  compact: boolean;
}

type LauncherRequest =
  | { type: 'launcher/openPanel' }
  | { type: 'launcher/openPopup' }
  | { type: 'launcher/pasteCode' }
  | { type: 'launcher/captureToken' };

const HOST_ID = 'dra-page-launcher';
const POSITION_KEY = 'dra:launcher:position';

const EDGE_MARGIN = 24;
const BOTTOM_MARGIN = 96;
const ENTER_DELAY_MS = 900;
const HIDE_FALLBACK_MS = 8_000;
const PILL_WIDTH = 200;
const PILL_HEIGHT = 40;

let hostElement: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let revealTimer: ReturnType<typeof setTimeout> | null = null;
let isSending = false;
let isHidden = false;
let uiClosedListener: ((message: unknown) => void) | null = null;

interface SavedPosition {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Reads the last dragged position, clamped to the current viewport. */
function loadPosition(): SavedPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedPosition>;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;

    return {
      x: clamp(parsed.x as number, 8, window.innerWidth - 48),
      y: clamp(parsed.y as number, 8, window.innerHeight - 48),
    };
  } catch {
    return null;
  }
}

function savePosition(position: SavedPosition): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  } catch {
    /* ignored on purpose */
  }
}

export function isLauncherMounted(): boolean {
  return hostElement?.isConnected === true;
}

export function isLauncherHidden(): boolean {
  return isHidden;
}

/**
 * Mounts the launcher. Safe to call repeatedly: an existing host is torn down
 * first, so a settings change takes effect immediately.
 */
export function mountLauncher(options: LauncherOptions): void {
  unmountLauncher();

  const saved = loadPosition();
  const left = saved?.x ?? (options.edge === 'right' ? window.innerWidth - EDGE_MARGIN - PILL_WIDTH : EDGE_MARGIN);
  const top = saved?.y ?? window.innerHeight - BOTTOM_MARGIN;

  hostElement = document.createElement('div');
  hostElement.id = HOST_ID;
  hostElement.style.cssText =
    'position:fixed;' +
    `left:${Math.round(left)}px;top:${Math.round(top)}px;` +
    'z-index:2147483600;opacity:0;' +
    'transition:opacity .28s ease, transform .28s cubic-bezier(.2,.9,.3,1.2);' +
    'transform:translateY(8px) scale(.94);' +
    'visibility:visible;pointer-events:auto;';

  shadow = hostElement.attachShadow({ mode: 'closed' });
  shadow.innerHTML = renderMarkup(options.compact);

  document.documentElement.appendChild(hostElement);
  wireBehaviour(options.compact);
  wireUiClosedListener();

  if (dismissTimer !== null) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => {
    if (!hostElement || isHidden) return;
    hostElement.style.setProperty('opacity', '1');
    hostElement.style.setProperty('transform', 'translateY(0) scale(1)');
  }, prefersReducedMotion() ? 0 : ENTER_DELAY_MS);
}

export function unmountLauncher(): void {
  clearHideTimers();
  detachUiClosedListener();
  isHidden = false;
  hostElement?.remove();
  hostElement = null;
  shadow = null;
}

/** Collapses the pill after a successful open; keeps host for position. */
export function hideLauncher(): void {
  if (!hostElement || isHidden) return;
  isHidden = true;

  const reduced = prefersReducedMotion();
  hostElement.style.setProperty('opacity', '0');
  hostElement.style.setProperty('transform', reduced ? 'none' : 'translateY(6px) scale(.88)');

  const finalize = (): void => {
    if (!hostElement || !isHidden) return;
    hostElement.style.setProperty('visibility', 'hidden');
    hostElement.style.setProperty('pointer-events', 'none');
  };

  if (reduced) {
    finalize();
  } else {
    setTimeout(finalize, 280);
  }

  if (revealTimer !== null) clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    revealTimer = null;
    showLauncher();
  }, HIDE_FALLBACK_MS);
}

/** Restores the pill after the extension UI closes (or fallback timer). */
export function showLauncher(): void {
  clearHideTimers();
  if (!hostElement || !isHidden) return;

  isHidden = false;
  hostElement.style.setProperty('visibility', 'visible');
  hostElement.style.setProperty('pointer-events', 'auto');

  const reduced = prefersReducedMotion();
  if (reduced) {
    hostElement.style.setProperty('opacity', '1');
    hostElement.style.setProperty('transform', 'none');
    return;
  }

  hostElement.style.setProperty('opacity', '0');
  hostElement.style.setProperty('transform', 'translateY(8px) scale(.94)');
  requestAnimationFrame(() => {
    hostElement?.style.setProperty('opacity', '1');
    hostElement?.style.setProperty('transform', 'translateY(0) scale(1)');
  });
}

function clearHideTimers(): void {
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (revealTimer !== null) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
}

function wireUiClosedListener(): void {
  detachUiClosedListener();
  uiClosedListener = (message: unknown) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: string }).type === 'launcher/uiClosed'
    ) {
      showLauncher();
    }
  };
  chrome.runtime.onMessage.addListener(uiClosedListener);
}

function detachUiClosedListener(): void {
  if (uiClosedListener) {
    chrome.runtime.onMessage.removeListener(uiClosedListener);
    uiClosedListener = null;
  }
}

function renderMarkup(compact: boolean): string {
  const label = compact ? '' : '<span class="label">Accounts</span>';

  return `
<style>${STYLES}</style>
<div class="pill${compact ? ' pill--compact' : ''}" data-state="idle"
     role="toolbar" tabindex="0" aria-label="Discord Register Accounts">
  <span class="brand" aria-hidden="true">${userPlusIcon}</span>
  ${label}
  <span class="divider" aria-hidden="true"></span>
  <button class="action" type="button" data-action="panel" title="Open the side panel" aria-label="Open the side panel">${panelRightIcon}</button>
  <button class="action" type="button" data-action="popup" title="Open the compact window" aria-label="Open the compact window">${windowIcon}</button>
  <button class="action" type="button" data-action="paste" title="Paste latest verification code" aria-label="Paste latest verification code">${clipboardIcon}</button>
  <button class="action" type="button" data-action="capture" title="Capture Discord token" aria-label="Capture Discord token">${keyIcon}</button>
  <span class="spinner" aria-hidden="true"></span>
</div>`;
}

function setLauncherState(state: 'idle' | 'opening' | 'done' | 'error'): void {
  const pill = shadow?.querySelector<HTMLElement>('.pill');
  if (!pill) return;
  pill.dataset.state = state;
}

let resetTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleStateReset(): void {
  if (resetTimer !== null) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    resetTimer = null;
    setLauncherState('idle');
  }, 1_400);
}

function wireBehaviour(compact: boolean): void {
  if (!shadow) return;

  const pill = shadow.querySelector<HTMLElement>('.pill');
  if (!pill) return;

  pill.addEventListener('click', (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest('[data-action]');
    if (target) {
      event.stopPropagation();
      const action = target.getAttribute('data-action');
      if (action === 'panel') void send({ type: 'launcher/openPanel' });
      else if (action === 'popup') void send({ type: 'launcher/openPopup' });
      else if (action === 'paste') void sendQuick({ type: 'launcher/pasteCode' });
      else if (action === 'capture') void sendQuick({ type: 'launcher/captureToken' });
      return;
    }
    void send({ type: 'launcher/openPanel' });
  });

  pill.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void send({ type: 'launcher/openPanel' });
  });

  makeDraggable(pill, compact);
}

function makeDraggable(pill: HTMLElement, compact: boolean): void {
  const travelThreshold = compact ? 2 : 5;
  let pointerActive = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let dragging = false;

  const endDrag = (persist: boolean): void => {
    pointerActive = false;
    if (!dragging) return;

    dragging = false;
    pill.classList.remove('pill--dragging');

    if (hostElement) {
      hostElement.style.transition = '';
      if (persist) {
        savePosition({
          x: parseFloat(hostElement.style.left),
          y: parseFloat(hostElement.style.top),
        });
      }
    }
  };

  pill.addEventListener('pointerdown', (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest('[data-action]')) return;
    if (event.button !== 0) return;

    const rect = pill.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left;
    originY = rect.top;

    pointerActive = true;
    dragging = false;

    pill.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  pill.addEventListener('pointermove', (event: PointerEvent) => {
    if (!pointerActive) return;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (!dragging) {
      if (Math.abs(deltaX) < travelThreshold && Math.abs(deltaY) < travelThreshold) return;

      dragging = true;
      pill.classList.add('pill--dragging');
      if (hostElement) hostElement.style.transition = 'none';
    }

    const next = {
      x: clamp(originX + deltaX, 8, window.innerWidth - PILL_HEIGHT - 8),
      y: clamp(originY + deltaY, 8, window.innerHeight - PILL_HEIGHT - 8),
    };

    if (hostElement) {
      hostElement.style.left = `${Math.round(next.x)}px`;
      hostElement.style.top = `${Math.round(next.y)}px`;
    }
  });

  pill.addEventListener('pointerup', (event: PointerEvent) => {
    pill.releasePointerCapture?.(event.pointerId);
    endDrag(true);
  });

  pill.addEventListener('pointercancel', () => endDrag(false));
  pill.addEventListener('lostpointercapture', () => endDrag(false));
}

async function sendQuick(message: Extract<LauncherRequest, { type: 'launcher/pasteCode' | 'launcher/captureToken' }>): Promise<void> {
  if (isSending) return;
  isSending = true;
  setLauncherState('opening');

  try {
    const response = (await chrome.runtime.sendMessage(message)) as
      | { ok: boolean; data?: { ok: boolean; message?: string }; error?: { message: string } }
      | undefined;

    if (!response?.ok) {
      setLauncherState('error');
      showToast('Action failed', response?.error?.message ?? 'Unknown error.', 'warning');
      scheduleStateReset();
      return;
    }

    const data = response.data;
    if (data && data.ok === false) {
      setLauncherState('error');
      showToast('Action failed', data.message ?? 'Could not complete.', 'warning');
      scheduleStateReset();
      return;
    }

    setLauncherState('done');
    showToast(
      message.type === 'launcher/pasteCode' ? 'Code pasted' : 'Token captured',
      data?.message ?? 'Done.',
      'success',
    );
    scheduleStateReset();
  } catch {
    setLauncherState('error');
    scheduleStateReset();
  } finally {
    setTimeout(() => {
      isSending = false;
    }, 700);
  }
}

async function send(message: Extract<LauncherRequest, { type: 'launcher/openPanel' | 'launcher/openPopup' }>): Promise<void> {
  if (isSending) return;
  isSending = true;

  setLauncherState('opening');

  try {
    const response = (await chrome.runtime.sendMessage(message)) as
      | { ok: boolean; data?: LauncherOpenResult; error?: { message: string } }
      | undefined;

    if (!response) {
      setLauncherState('error');
      scheduleStateReset();
      return;
    }

    if (response.ok === false) {
      setLauncherState('error');
      showToast('Could not open', response.error?.message ?? 'Unknown error.', 'warning');
      scheduleStateReset();
      return;
    }

    const result = response.data;

    if (!result?.opened) {
      setLauncherState('error');
      showToast('Could not open', result?.reason ?? 'Unknown error.', 'warning');
      scheduleStateReset();
      return;
    }

    setLauncherState('done');
    hideLauncher();
  } catch {
    setLauncherState('error');
    scheduleStateReset();
    unmountLauncher();
  } finally {
    setTimeout(() => {
      isSending = false;
    }, 700);
  }
}

const STYLES = `
  :host { all: initial; }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 8px 0 6px;
    border-radius: 20px;
    background: linear-gradient(150deg, #5865F2 0%, #4752C4 60%, #7C5CFC 100%);
    box-shadow: 0 8px 22px rgba(88,101,242,.38), 0 2px 6px rgba(0,0,0,.3);
    font-family: 'Inter','gg sans','Segoe UI',system-ui,sans-serif;
    color: #fff;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    transition: box-shadow .18s ease, transform .18s ease;
  }
  .pill:hover { box-shadow: 0 10px 28px rgba(88,101,242,.5), 0 2px 8px rgba(0,0,0,.34); }
  .pill:focus-visible { outline: 3px solid rgba(255,255,255,.55); outline-offset: 2px; }
  .pill--dragging { cursor: grabbing; transform: scale(1.04); }
  .pill--compact { padding: 0; width: 40px; justify-content: center; }
  .pill--compact .divider,
  .pill--compact .label,
  .pill--compact .action:not([data-action="panel"]) { display: none; }

  .brand {
    display: flex; width: 28px; height: 28px; border-radius: 50%;
    background: rgba(255,255,255,.16); align-items: center; justify-content: center;
    flex: none;
  }
  .brand svg { width: 16px; height: 16px; }

  .label {
    font-size: 13px; font-weight: 600; letter-spacing: .01em;
    white-space: nowrap; padding-right: 2px;
  }

  .divider { width: 1px; height: 18px; background: rgba(255,255,255,.24); flex: none; }

  .action {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: rgba(255,255,255,.12); color: #fff;
    border: 0; cursor: pointer; padding: 0;
    transition: background .15s ease, transform .15s ease;
  }
  .action:hover { background: rgba(255,255,255,.26); }
  .action:active { transform: scale(.9); }
  .action:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  .action svg { width: 14px; height: 14px; }

  .spinner { display: none; }

  .pill[data-state='opening'] .spinner,
  .pill[data-state='done'] .spinner {
    display: block;
    width: 13px; height: 13px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,.35);
    border-top-color: #fff;
    animation: dra-rotate 640ms linear infinite;
  }

  .pill[data-state='done'] .spinner {
    animation: none;
    border: 2px solid rgba(255,255,255,.35);
    background: #fff;
  }

  .pill[data-state='opening'] { cursor: progress; }
  .pill[data-state='opening'] .action,
  .pill[data-state='done'] .action { opacity: .45; pointer-events: none; }
  .pill[data-state='error'] { background: linear-gradient(150deg, #E0574B 0%, #A12828 100%); }

  @keyframes dra-rotate { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    .pill { transition: none; }
    .pill[data-state='opening'] .spinner { animation-duration: 1.4s; }
  }
`;
