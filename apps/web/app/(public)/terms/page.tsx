import type { Metadata } from 'next';
import { ContentPage } from '@/components/content/ContentPage';
import { readContent } from '@/lib/content';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function Page() {
  return <ContentPage markdown={readContent('terms')} numbered />;
}
