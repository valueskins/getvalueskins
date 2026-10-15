'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

interface FieldProps {
  id: string;
  label: ReactNode;
  /** "(optional)" after the label. */
  optional?: boolean;
  help?: ReactNode;
  /** Added under the help text, never in place of it. */
  error?: string | null;
  /** Shown at the right of the label row, for example a character counter. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Ids for aria-describedby: the help and error lines of the field `id`. */
export function describedBy(id: string, help: unknown, error: unknown): string | undefined {
  const ids = [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export function Field({
  id,
  label,
  optional,
  help,
  error,
  aside,
  children,
  className,
}: FieldProps) {
  const labelEl = (
    <label className="field-label" htmlFor={id}>
      {label}
      {optional ? <span className="opt"> (optional)</span> : null}
    </label>
  );
  return (
    <div className={cx('field', className)}>
      {aside ? (
        <div className="field-row">
          {labelEl}
          {aside}
        </div>
      ) : (
        labelEl
      )}
      {children}
      {help ? (
        <p id={`${id}-help`} className="field-help">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="field-error">
          <Icon name="warningCircle" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface ControlExtra {
  invalid?: boolean;
  mono?: boolean;
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & ControlExtra
>(function Input({ invalid, mono, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx('input', mono && 'mono t-mono', invalid && 'is-error', className)}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & ControlExtra
>(function Textarea({ invalid, className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx('input min-h-[112px] py-2.5', invalid && 'is-error', className)}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & ControlExtra
>(function Select({ invalid, className, children, ...rest }, ref) {
  return (
    <span className="input-wrap">
      <select
        ref={ref}
        {...rest}
        aria-invalid={invalid || undefined}
        className={cx('input pr-10', invalid && 'is-error', className)}
      >
        {children}
      </select>
      <span className="input-adorn" aria-hidden="true">
        <Icon name="caretDown" />
      </span>
    </span>
  );
});

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  invalid?: boolean;
}

export function Checkbox({ label, invalid, className, disabled, ...rest }: CheckboxProps) {
  return (
    <label className={cx('check', disabled && 'is-disabled', className)}>
      <input
        type="checkbox"
        {...rest}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cx('check-box', invalid && 'is-error')}
      />
      <span>{label}</span>
    </label>
  );
}
