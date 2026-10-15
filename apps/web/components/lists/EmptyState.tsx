import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

export function EmptyState({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-start gap-3 px-6 py-12 md:px-12 md:py-16">
      <span className="text-ink-3">
        <Icon name="tray" size={24} />
      </span>
      <h2 className="t-h3">{title}</h2>
      <p className="t-body c-ink-2 max-w-[56ch]">{text}</p>
      {children ? <div className="mt-2 flex flex-wrap gap-3">{children}</div> : null}
    </div>
  );
}
