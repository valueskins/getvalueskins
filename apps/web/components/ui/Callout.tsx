import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export type Tone = 'info' | 'wait' | 'ok' | 'error';

const ICON: Record<Tone, IconName> = {
  info: 'info',
  wait: 'warning',
  ok: 'checkCircle',
  error: 'warningCircle',
};

interface CalloutProps {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
}

export function Callout({ tone = 'info', title, children, className, role }: CalloutProps) {
  return (
    <div className={cx('callout', `callout-${tone}`, className)} role={role}>
      <Icon name={ICON[tone]} />
      <div>
        {title ? <p className="callout-title">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

export type BadgeKind =
  'draft' | 'open' | 'progress' | 'wait' | 'ok' | 'done' | 'cancelled' | 'new' | 'error';

const BADGE: Record<BadgeKind, string> = {
  draft: 'badge-draft',
  open: 'badge-open',
  progress: 'badge-progress',
  wait: 'badge-wait',
  ok: 'badge-ok',
  done: 'badge-done',
  cancelled: 'badge-cancelled',
  new: 'badge-new',
  error: 'badge-error',
};

export function Badge({
  kind,
  children,
  className,
}: {
  kind: BadgeKind;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx('badge', BADGE[kind], className)}>{children}</span>;
}

/** A form with several errors gets this at the top, with links to the fields. */
export function ErrorSummary({ errors }: { errors: Array<{ id: string; message: string }> }) {
  if (errors.length < 2) return null;
  return (
    <div className="err-summary" role="alert" tabIndex={-1}>
      <p className="callout-title">Fix these to continue</p>
      <ul>
        {errors.map((e) => (
          <li key={e.id}>
            <a href={`#${e.id}`}>{e.message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
