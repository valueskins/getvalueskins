'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cx } from '@/components/ui/cx';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number | null;
}

/** Tabs with arrow-key movement (the design's `.tabs`). */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (event: KeyboardEvent, i: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (i + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length;
    onChange(items[next]!.id);
    refs.current[next]?.focus();
  };
  return (
    <div className="tabs mb-6" role="tablist" aria-label={label}>
      {items.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={value === t.id ? 0 : -1}
          className={cx('tab', value === t.id && 'is-active')}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
          {t.count !== undefined && t.count !== null ? (
            <span className="count">{t.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
