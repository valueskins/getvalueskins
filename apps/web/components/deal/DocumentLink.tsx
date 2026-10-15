import type { DocumentKind } from '@valueskins/shared';
import type { ReactNode } from 'react';
import { apiUrl } from '@/lib/api/client';

/**
 * A PDF from the API (SPEC 6.5 documents). A plain link: the browser sends the
 * session cookie and saves the file the API names. Only shown for documents the
 * deal lists, so it is never "not available yet".
 */
export function DocumentLink({
  dealId,
  kind,
  className,
  children,
}: {
  dealId: string;
  kind: DocumentKind;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={apiUrl(`/deals/${dealId}/documents/${kind}`)} className={className} download>
      {children}
    </a>
  );
}
