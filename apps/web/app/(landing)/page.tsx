import type { Metadata } from 'next';
import { initialDigits } from '@/components/landing/amount';
import { Landing } from '@/components/landing/Landing';

export const metadata: Metadata = {
  title: { absolute: 'ValueSkins: where Indian brands and Instagram creators work together' },
  description:
    'Brands post paid deals, creators apply, and every finished deal goes on both profiles. Sign in with Instagram.',
};

/** `?amount=` is the deal calculator's form, so its figures work without script too. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { amount } = await searchParams;
  return <Landing initialDigits={initialDigits(amount)} />;
}
