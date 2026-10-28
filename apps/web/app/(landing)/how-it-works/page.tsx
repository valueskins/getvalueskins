import type { Metadata } from 'next';
import { HowItWorksPage } from '@/components/public/HowItWorksPage';
import { parseSections, readContent } from '@/lib/content';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Brands post paid deals, creators apply, and the creator is paid directly by UPI: 30% before work starts, 70% after approval.',
};

export default function Page() {
  return <HowItWorksPage doc={parseSections(readContent('how-it-works'))} />;
}
