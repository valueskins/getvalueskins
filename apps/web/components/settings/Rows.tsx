import type { ReactNode } from 'react';

export function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="row">
      <p className="row-k">{k}</p>
      <div className="row-v">{children}</div>
    </div>
  );
}

export function Panel({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-6" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-5 md:px-6">
        <h2 id={`${id}-title`} className="t-h3">
          {title}
        </h2>
        {action}
      </div>
      <div className="flex flex-col gap-4 px-5 pb-5 md:px-6 md:pb-6">{children}</div>
    </section>
  );
}
