'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { longDate } from '@/lib/deadlines';
import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}
function toStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(s: string, n: number): string {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}

interface DateFieldProps {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  /** Today in IST: earlier days cannot be picked. */
  today: string;
  /** The other two dates, marked with a dot. */
  marks: Array<string | null>;
  help: string;
  error?: string | null;
}

/**
 * A date with a calendar (the design's DateField). Days before today are off,
 * the other two dates have a dot. Arrow keys move by day and week, Enter picks,
 * Escape closes and returns focus to the field.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
  today,
  marks,
  help,
  error,
}: DateFieldProps) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(value ?? today);
  const trigger = useRef<HTMLButtonElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const view = toDate(focus);
  const year = view.getUTCFullYear();
  const month = view.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayDate = toDate(today);
  const canPrev =
    year > todayDate.getUTCFullYear() ||
    (year === todayDate.getUTCFullYear() && month > todayDate.getUTCMonth());

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
  }, [open, focus]);

  const pick = (d: string) => {
    if (d < today) return;
    onChange(d);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in moves) {
      event.preventDefault();
      const next = addDays(focus, moves[event.key]!);
      setFocus(next < today ? today : next);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  };

  const shift = (n: number) => {
    const d = new Date(Date.UTC(year, month + n, 1));
    const s = toStr(d);
    setFocus(s < today ? today : s);
  };

  return (
    <div className="field relative" ref={wrapper}>
      <label className="field-label" id={labelId} htmlFor={id}>
        {label}
      </label>
      <button
        ref={trigger}
        type="button"
        id={id}
        className={cx('input date-btn', error && 'is-error')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={[`${id}-help`, error ? `${id}-error` : ''].filter(Boolean).join(' ')}
        onClick={() => {
          setFocus(value ?? today);
          setOpen((v) => !v);
        }}
      >
        <span className={value ? undefined : 'ph'}>{value ? longDate(value) : 'Pick a date'}</span>
        <Icon name="calendar" />
      </button>
      <p id={`${id}-help`} className="field-help">
        {help}
      </p>
      {error ? (
        <p id={`${id}-error`} className="field-error">
          <Icon name="warningCircle" size={16} />
          {error}
        </p>
      ) : null}
      {open ? (
        <div className="cal" role="dialog" aria-label={`Pick the ${label} date`} onKeyDown={onKey}>
          <div className="cal-head">
            {canPrev ? (
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label="Previous month"
                onClick={() => shift(-1)}
              >
                <Icon name="arrowRight" size={16} className="rotate-180" />
              </button>
            ) : (
              <span className="w-9" />
            )}
            <p className="t-small font-semibold" aria-live="polite">
              {MONTHS[month]} {year}
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Next month"
              onClick={() => shift(1)}
            >
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
          <div className="cal-grid" aria-hidden="true">
            {DOW.map((d) => (
              <span key={d} className="cal-dow">
                {d}
              </span>
            ))}
          </div>
          <div className="cal-grid" ref={grid}>
            {Array.from({ length: lead }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const d = toStr(new Date(Date.UTC(year, month, i + 1)));
              const past = d < today;
              return (
                <button
                  key={d}
                  type="button"
                  data-date={d}
                  className={cx(
                    'cal-day',
                    d === today && 'is-today',
                    d === value && 'is-sel',
                    marks.includes(d) && d !== value && 'is-mark',
                  )}
                  disabled={past}
                  tabIndex={d === focus ? 0 : -1}
                  aria-pressed={d === value}
                  aria-label={`${longDate(d)}${past ? ', in the past' : ''}`}
                  onClick={() => pick(d)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="cal-foot">
            Dates before today cannot be picked. A blue dot marks your other two dates.
          </p>
        </div>
      ) : null}
    </div>
  );
}
