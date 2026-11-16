import { PublicFrame } from '@/components/shell/SiteChrome';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicFrame>
      <main id="main" className="flex-1">
        {children}
      </main>
    </PublicFrame>
  );
}
