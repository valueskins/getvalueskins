'use client';

import { useId, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useMediaQuery } from '@/components/ui/useMediaQuery';

interface SectionProps {
  title: string;
  /** Short text at the right of the header, like a count. */
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Fold on phones (the deal page sections), or always (the brief). */
  fold?: 'phone' | 'always' | 'never';
  defaultOpen?: boolean;
}

/** A deal page section (`.sec`). It folds on phones so the Next step stays near the top. */
export function Section({
  title,
  aside,
  children,
  footer,
  fold = 'phone',
  defaultOpen = false,
}: SectionProps) {
  const id = useId();
  const phone = useMediaQuery('(max-width: 767px)');
  const foldable = fold === 'always' || (fold === 'phone' && phone);
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !foldable || open;
  return (
    <section className="sec" aria-labelledby={`${id}-h`}>
      {foldable ? (
        <button
          type="button"
          className="fold-btn"
          aria-expanded={open}
          aria-controls={`${id}-b`}
          onClick={() => setOpen((v) => !v)}
        >
          <span id={`${id}-h`} className="t-h3">
            {title}
          </span>
          <span className="t-small c-ink-2 inline-flex items-center gap-1.5">
            {aside}
            <Icon name="caretDown" size={16} className={open ? 'rotate-180' : undefined} />
          </span>
        </button>
      ) : (
        <div className="sec-h">
          <h2 id={`${id}-h`} className="t-h3">
            {title}
          </h2>
          {aside ? <span className="t-small c-ink-3">{aside}</span> : null}
        </div>
      )}
      {showBody ? (
        <div id={`${id}-b`}>
          <div className="sec-b">{children}</div>
          {footer ? <p className="sec-foot">{footer}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
