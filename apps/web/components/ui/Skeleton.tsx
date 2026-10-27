import { cx } from './cx';

/** Loading pages use skeletons, not spinners. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <span className={cx('skel block', className)} style={style} aria-hidden="true" />;
}

/** A card-shaped placeholder: a title line, a shorter line, and a badge-sized pill. */
export function CardSkeleton() {
  return (
    <div className="skel-card" aria-hidden="true">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-1/4" />
    </div>
  );
}

/** The loading page: a heading, then cards shaped like the lists most pages show. */
export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 flex flex-col gap-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
