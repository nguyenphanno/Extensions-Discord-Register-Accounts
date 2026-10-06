import type { ChangeEvent, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../lib/ClassNames';

export interface SectionCardProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function SectionCard({
  icon,
  title,
  description,
  children,
  actions,
}: SectionCardProps): ReactNode {
  return (
    <section className="SectionCard">
      <header className="SectionCard__header">
        {icon ? (
          <span className="SectionCard__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="SectionCard__heading">
          <h3 className="SectionCard__title">{title}</h3>
          {description ? <p className="SectionCard__description">{description}</p> : null}
        </div>
        {actions ? <div style={{ marginLeft: 'auto' }}>{actions}</div> : null}
      </header>
      <div className="SectionCard__body">{children}</div>
    </section>
  );
}

export interface SettingRowProps {
  label: string;
  description?: string;
  control: ReactNode;
  stacked?: boolean;
  id?: string;
}

/** One label/description on the left, one control on the right. */
export function SettingRow({
  label,
  description,
  control,
  stacked = false,
  id,
}: SettingRowProps): ReactNode {
  return (
    <div className={cx('SettingRow', stacked ? 'SettingRow--stacked' : null)}>
      <label className="SettingRow__text" htmlFor={id}>
        <span className="SettingRow__label">{label}</span>
        {description ? <span className="SettingRow__description">{description}</span> : null}
      </label>
      <div className="SettingRow__control">{control}</div>
    </div>
  );
}

export interface TextFieldProps {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  type?: 'text' | 'url' | 'number' | 'date';
  mono?: boolean;
  disabled?: boolean;
  prefix?: string;
  trailing?: ReactNode;
  maxLength?: number;
  onBlur?: () => void;
  autoFocus?: boolean;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = 'text',
  mono = false,
  disabled = false,
  prefix,
  trailing,
  maxLength,
  onBlur,
  autoFocus,
}: TextFieldProps): ReactNode {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="Field">
      {label ? (
        <div className="Field__labelRow">
          <label className="Field__label" htmlFor={id}>
            {label}
          </label>
        </div>
      ) : null}

      <div className={cx('Field__control', error ? 'Field__control--invalid' : null)}>
        {prefix ? <span className="Field__affix">{prefix}</span> : null}
        <input
          id={id}
          type={type}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          className={cx('Field__input', mono ? 'Field__input--mono' : null)}
        />
        {trailing ? <div className="Field__actions">{trailing}</div> : null}
      </div>

      {error ? (
        <p className="Field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="Field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface SelectFieldProps<TValue extends string> {
  id: string;
  value: TValue;
  options: readonly { value: TValue; label: string }[];
  onChange: (value: TValue) => void;
  ariaLabel: string;
  disabled?: boolean;
}

export function SelectField<TValue extends string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: SelectFieldProps<TValue>): ReactNode {
  return (
    <div className="Select">
      <select
        id={id}
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as TValue)}
        className="Select__native"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="Select__chevron" aria-hidden="true" />
    </div>
  );
}

export interface ToggleRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: ToggleRowProps): ReactNode {
  return (
    <SettingRow
      label={label}
      description={description}
      control={
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className="Toggle"
        >
          <span className="Toggle__knob" />
        </button>
      }
    />
  );
}

export interface RangeRowProps {
  id: string;
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

export function RangeRow({
  id,
  label,
  description,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: RangeRowProps): ReactNode {
  return (
    <SettingRow
      label={label}
      description={description}
      stacked
      id={id}
      control={
        <div className="Range">
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={label}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onChange(Number(event.target.value))
            }
            className="Range__input"
          />
          <output className="Range__value" htmlFor={id}>
            {format ? format(value) : value}
          </output>
        </div>
      }
    />
  );
}

export interface InfoRowProps {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}

/** Read-only key/value line used by the About and Diagnostics sections. */
export function InfoRow({ icon, label, value }: InfoRowProps): ReactNode {
  return (
    <div className="SettingRow">
      <span className="SettingRow__text">
        <span
          className="SettingRow__label"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {icon}
          {label}
        </span>
      </span>
      <span
        className="SettingRow__control"
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          justifyContent: 'flex-end',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

