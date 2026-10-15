import type { Metadata } from 'next';
import { ContentPage } from '@/components/content/ContentPage';
import { readContent } from '@/lib/content';

export const metadata: Metadata = { title: 'How it works' };

export default function Page() {
  return <ContentPage markdown={readContent('how-it-works')} />;
}
