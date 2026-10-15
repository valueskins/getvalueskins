import { Button } from '@/components/ui/Button';

/** "Show more" for cursor lists. There is no total count, so the button shows while there is a next page. */
export function ShowMore({
  hasMore,
  loading,
  onMore,
  label,
}: {
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
  label: string;
}) {
  if (!hasMore) return null;
  return (
    <div className="mt-8 flex justify-center">
      <Button variant="secondary" loading={loading} onClick={onMore} className="w-full sm:w-auto">
        {label}
      </Button>
    </div>
  );
}
