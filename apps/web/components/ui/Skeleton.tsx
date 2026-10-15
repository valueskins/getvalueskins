import { cx } from './cx';

/** Loading pages use skeletons, not spinners. */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cx('skel block', className)} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-48" />
      <div className="mt-6 flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
