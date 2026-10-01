import Link from 'next/link';

// Temporary shell for the pages under app/(temporary). The real UI arrives from
// the design handoff and replaces this whole folder.
export default function TemporaryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-12">
      <main className="flex-1">{children}</main>
      <footer className="mt-12 flex gap-6 border-t border-line pt-4 text-sm text-muted">
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
        <Link href="/terms" className="underline">
          Terms
        </Link>
      </footer>
    </div>
  );
}
