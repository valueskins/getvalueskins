'use client';

import { useConfig } from '@/lib/api/queries';

/** The support address from GET /config, as a mailto link. Renders nothing until it is known. */
export function SupportEmail({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const config = useConfig();
  const email = config.data?.supportEmail;
  if (!email) return null;
  return (
    <a href={`mailto:${email}`} className={className}>
      {children ?? email}
    </a>
  );
}

/** The bare address, for sentences. Falls back to "our support address" while loading. */
export function useSupportEmail(): string {
  return useConfig().data?.supportEmail ?? 'our support address';
}
