import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { bem, cx } from '../lib/ClassNames';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'dangerOutline'
  | 'outline'
  | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

/** `primary` is the unstyled base, so it maps to no modifier class. */
const VARIANT_MODIFIERS: Record<ButtonVariant, string | null> = {
  primary: null,
  secondary: 'secondary',
  success: 'success',
  danger: 'danger',
  dangerOutline: 'dangerOutline',
  outline: 'outline',
  ghost: 'ghost',
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  icon,
  iconRight,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps): ReactNode {
  const modifier = VARIANT_MODIFIERS[variant];

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'Button',
        modifier ? `Button--${modifier}` : null,
        size !== 'md' ? `Button--${size}` : null,
        block ? 'Button--block' : null,
        className,
      )}
    >
      {loading ? <span className="Button__spinner" aria-hidden="true" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only control has no accessible name otherwise. */
  label: string;
  tone?: 'default' | 'danger';
  active?: boolean;
  icon: ReactNode;
}

export function IconButton({
  label,
  tone = 'default',
  active = false,
  icon,
  className,
  type = 'button',
  ...rest
}: IconButtonProps): ReactNode {
  return (
    <button
      {...rest}
      type={type}
      title={label}
      aria-label={label}
      className={cx(bem('IconButton', { danger: tone === 'danger', active }), className)}
    >
      <span style={{ width: 16, height: 16, display: 'inline-flex' }} aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

export interface SpinnerProps {
  size?: number;
  label?: string;
}

export function Spinner({ size = 16, label = 'Loading' }: SpinnerProps): ReactNode {
  return (
    <span
      role="status"
      aria-label={label}
      style={{ display: 'inline-flex', width: size, height: size, color: 'var(--text-muted)' }}
    >
      <Loader2 size={size} style={{ animation: 'dra-spin 700ms linear infinite' }} />
    </span>
  );
}

export interface ChipProps {
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
}

export function Chip({ tone = 'default', icon, children, title }: ChipProps): ReactNode {
  return (
    <span className={cx('Chip', tone !== 'default' ? `Chip--${tone}` : null)} title={title}>
      {icon}
      {children}
    </span>
  );
}

export interface BadgeProps {
  children: ReactNode;
  neutral?: boolean;
}

export function Badge({ children, neutral = false }: BadgeProps): ReactNode {
  return <span className={cx('Badge', neutral ? 'Badge--neutral' : null)}>{children}</span>;
}

export interface StatusDotProps {
  tone?: 'online' | 'idle' | 'busy' | 'offline';
  pulse?: boolean;
  title?: string;
}

export function StatusDot({ tone = 'offline', pulse = false, title }: StatusDotProps): ReactNode {
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={cx(
        'StatusDot',
        tone !== 'offline' ? `StatusDot--${tone}` : null,
        pulse ? 'StatusDot--pulse' : null,
      )}
    />
  );
}

export interface TooltipProps {
  text: string;
  children: ReactNode;
}

export function Tooltip({ text, children }: TooltipProps): ReactNode {
  return (
    <span className="Tooltip">
      {children}
      <span role="tooltip" className="Tooltip__bubble">
        {text}
      </span>
    </span>
  );
}

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: string;
}

export function Skeleton({ width = '100%', height = 14, radius }: SkeletonProps): ReactNode {
  return (
    <span
      aria-hidden="true"
      className="Skeleton"
      style={{ display: 'block', width, height, borderRadius: radius }}
    />
  );
}

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps): ReactNode {
  return (
    <div className="EmptyState">
      <span className="EmptyState__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="EmptyState__title">{title}</span>
      {body ? <p className="EmptyState__body">{body}</p> : null}
      {action}
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }): ReactNode {
  return <span className="VisuallyHidden">{children}</span>;
}

export interface SegmentedProps<TValue extends string> {
  value: TValue;
  options: readonly { value: TValue; label: string; icon?: ReactNode }[];
  onChange: (value: TValue) => void;
  ariaLabel: string;
}

/** Discord-style segmented control; the visual sibling of a radio group. */
export function Segmented<TValue extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<TValue>): ReactNode {
  return (
    <div className="Segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className="Segmented__option"
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface ProgressBarProps {
  /** 0-100 */
  percent: number;
}

export function ProgressBar({ percent }: ProgressBarProps): ReactNode {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      className="ProgressBar"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="ProgressBar__fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export interface ProgressRingProps {
  size?: number;
  thickness?: number;
  /** 0-1 */
  progress: number;
  label?: string;
}

export function ProgressRing({
  size = 40,
  thickness = 3,
  progress,
  label,
}: ProgressRingProps): ReactNode {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);

  return (
    <span
      className="ProgressRing"
      role="img"
      aria-label={label ?? `${Math.round(clamped * 100)}%`}
      style={{ display: 'inline-flex', width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="ProgressRing__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
        />
        <circle
          className="ProgressRing__indicator"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </span>
  );
}

