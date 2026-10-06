import type { ReactNode } from 'react';
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { cx } from '../lib/ClassNames';
import { evaluatePassword, type StrengthReport } from '../lib/PasswordStrength';
import { IconButton, Spinner } from './Primitives';

export interface CopyFieldProps {
  label: string;
  value: string;
  secret?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
  onCopy: () => void;
  onRegenerate?: () => void;
  /** Spins the regenerate button and disables it while the re-roll is running. */
  busy?: boolean;
  emptyLabel?: string;
}

/**
 * One labelled value with copy/reveal affordances.
 *
 * Masking avoids putting the real characters in the DOM at all: when hidden we
 * render a fixed-width dotted placeholder rather than the value, so a
 * screenshot or an inspector cannot expose it.
 */
export function CopyField({
  label,
  value,
  secret = false,
  revealed = false,
  onToggleReveal,
  onCopy,
  onRegenerate,
  busy = false,
  emptyLabel = 'Not generated yet',
}: CopyFieldProps): ReactNode {
  const isEmpty = value.length === 0;
  const isHidden = secret && !revealed;

  return (
    <div className="CopyField">
      <div className="CopyField__body">
        <span className="CopyField__label">{label}</span>
        <span
          className={cx('CopyField__value', isHidden ? 'CopyField__value--masked' : null)}
          title={isHidden || isEmpty ? undefined : value}
        >
          {isEmpty ? emptyLabel : isHidden ? '•'.repeat(14) : value}
        </span>
      </div>

      <div className="CopyField__actions">
        {onRegenerate ? (
          <IconButton
            label={`Regenerate ${label}`}
            onClick={onRegenerate}
            disabled={busy}
            icon={busy ? <Spinner size={14} label={`Regenerating ${label}`} /> : <RefreshCw size={15} />}
          />
        ) : null}

        {secret && onToggleReveal ? (
          <IconButton
            label={revealed ? `Hide ${label}` : `Reveal ${label}`}
            onClick={onToggleReveal}
            icon={revealed ? <EyeOff size={15} /> : <Eye size={15} />}
          />
        ) : null}

        <IconButton
          label={`Copy ${label}`}
          onClick={onCopy}
          disabled={isEmpty}
          icon={<Copy size={15} />}
        />
      </div>
    </div>
  );
}

export interface SecretFieldProps {
  id: string;
  label: string;
  value: string;
  revealed: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
  onRegenerate?: () => void;
  showStrength?: boolean;
}

/** Editable-looking secret with reveal, copy, regenerate and a strength meter. */
export function SecretField({
  id,
  label,
  value,
  revealed,
  onToggleReveal,
  onCopy,
  onRegenerate,
  showStrength = false,
}: SecretFieldProps): ReactNode {
  const report = evaluatePassword(value);

  return (
    <div className="Field">
      <div className="Field__labelRow">
        <label className="Field__label" htmlFor={id}>
          {label}
        </label>
      </div>

      <div className="Field__control">
        <span
          id={id}
          className={cx('Field__input', revealed ? 'Field__input--mono' : 'SecretField__value--masked')}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          {value.length === 0 ? '—' : revealed ? value : '•'.repeat(14)}
        </span>

        <div className="Field__actions">
          {onRegenerate ? (
            <IconButton label={`Regenerate ${label}`} onClick={onRegenerate} icon={<RefreshCw size={15} />} />
          ) : null}
          <IconButton
            label={revealed ? `Hide ${label}` : `Reveal ${label}`}
            onClick={onToggleReveal}
            icon={revealed ? <EyeOff size={15} /> : <Eye size={15} />}
          />
          <IconButton label={`Copy ${label}`} onClick={onCopy} icon={<Copy size={15} />} disabled={!value} />
        </div>
      </div>

      {showStrength ? <StrengthMeter report={report} /> : null}
    </div>
  );
}

export interface StrengthMeterProps {
  report: StrengthReport;
}

export function StrengthMeter({ report }: StrengthMeterProps): ReactNode {
  return (
    <div className="StrengthMeter">
      <div
        className="StrengthMeter__bars"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={report.level}
        aria-label={`Password strength: ${report.label}`}
      >
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cx(
              'StrengthMeter__bar',
              report.level >= step ? `StrengthMeter__bar--level${report.level}` : null,
            )}
          />
        ))}
      </div>
      <span className="StrengthMeter__label" title={`About ${report.searchSpaceBits} bits of entropy`}>
        {report.label} · {report.searchSpaceBits} bits
      </span>
    </div>
  );
}
