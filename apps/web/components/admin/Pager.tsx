'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

/**
 * Previous and Next over a cursor list (DESIGN_HANDOFF 5: admin tables page this way).
 * The cursors of the pages already seen are kept, so Previous goes back exactly.
 */
export function useCursorPages() {
  const [stack, setStack] = useState<string[]>([]);
  const cursor = stack.length ? stack[stack.length - 1]! : null;
  const next = useCallback((c: string) => setStack((s) => [...s, c]), []);
  const prev = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);
  return { cursor, page: stack.length + 1, next, prev, reset };
}

export function Pager({
  page,
  summary,
  nextCursor,
  noun,
  onPrev,
  onNext,
}: {
  page: number;
  summary: string;
  nextCursor: string | null;
  noun: string;
  onPrev: () => void;
  onNext: (cursor: string) => void;
}) {
  return (
    <div className="pager flex-wrap">
      <p className="t-small c-ink-2">{summary}</p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button variant="secondary" size="sm" onClick={onPrev}>
            <Icon name="caretLeft" size={16} />
            Previous
          </Button>
        ) : null}
        {nextCursor ? (
          <Button variant="secondary" size="sm" onClick={() => onNext(nextCursor)}>
            Next
            <Icon name="caretRight" size={16} />
          </Button>
        ) : page > 1 ? (
          <p className="t-small c-ink-3">No more {noun}</p>
        ) : null}
      </div>
    </div>
  );
}
