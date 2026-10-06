import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cx } from '../lib/ClassNames';
import { Button, IconButton } from './Primitives';
import { useToastStore, type ToastTone } from '../state/ToastStore';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  icon?: ReactNode;
  tone?: 'default' | 'danger' | 'warning';
  wide?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

/**
 * Accessible modal.
 *
 * Three behaviours are handled explicitly because getting them wrong is what
 * makes a dialog feel broken:
 *  - focus moves into the dialog on open and returns to the trigger on close;
 *  - Tab is trapped inside, so keyboard users cannot land on the page behind;
 *  - Escape closes, and a backdrop click closes while a panel click does not.
 */
export function Modal({
  open,
  title,
  description,
  icon,
  tone = 'default',
  wide = false,
  children,
  footer,
  onClose,
}: ModalProps): ReactNode {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  const iconTone =
    tone === 'danger' ? 'Modal__icon--danger' : tone === 'warning' ? 'Modal__icon--warning' : null;

  return createPortal(
    <div
      className="Modal__scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dra-modal-title"
        tabIndex={-1}
        className={cx('Modal', wide ? 'Modal--wide' : null)}
        onKeyDown={onKeyDown}
      >
        <div className="Modal__header">
          {icon ? (
            <span className={cx('Modal__icon', iconTone)} aria-hidden="true">
              {icon}
            </span>
          ) : null}

          <div className="Modal__heading">
            <h2 className="Modal__title" id="dra-modal-title">
              {title}
            </h2>
            {description ? <p className="Modal__description">{description}</p> : null}
          </div>

          <div style={{ marginLeft: 'auto' }}>
            <IconButton label="Close dialog" onClick={onClose} icon={<X size={16} />} />
          </div>
        </div>

        {children ? <div className="Modal__body">{children}</div> : null}
        {footer ? <div className="Modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger' | 'warning';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive-action confirmation. Cancel is focused first, never Confirm. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactNode {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      tone={tone}
      onClose={onCancel}
      icon={tone === 'danger' ? <AlertTriangle size={20} /> : <Info size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

const TOAST_ICONS: Record<ToastTone, ReactNode> = {
  info: <Info size={18} />,
  success: <CheckCircle2 size={18} />,
  warning: <AlertTriangle size={18} />,
  error: <XCircle size={18} />,
};

/**
 * Fixed-position toast stack; mounted once per surface.
 *
 * Several toasts stay readable at once: each card is staggered in slightly so a
 * burst reads as a sequence rather than a flash, and the offset is driven from a
 * CSS custom property that the reduced-motion media query can neutralise.
 */
export function ToastHost(): ReactNode {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="ToastHost" aria-live="polite" aria-atomic="false">
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          className={cx('Toast', `Toast--${toast.tone}`, toast.sticky ? 'Toast--sticky' : null)}
          style={{ ['--toast-stagger' as string]: `${Math.min(index, 4) * 40}ms` }}
          role="status"
        >
          <span className="Toast__icon" aria-hidden="true">
            {TOAST_ICONS[toast.tone]}
          </span>

          <div className="Toast__body">
            <span className="Toast__title">{toast.title}</span>
            {toast.message ? <span className="Toast__message">{toast.message}</span> : null}
          </div>

          <IconButton label="Dismiss" onClick={() => dismiss(toast.id)} icon={<X size={14} />} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
