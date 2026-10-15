import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/shell/SiteChrome';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <div className="mx-auto flex max-w-[680px] flex-col gap-4 px-4 pb-[88px] pt-10 md:px-8 md:pt-20">
          <p className="t-mono t-small c-ink-3">Error 404</p>
          <h1 className="t-h1">This page does not exist</h1>
          <p className="t-body c-ink-2">
            The link may be old or mistyped. If someone sent you a link to a deal, it may have
            closed, or it belongs to other people.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/" className="btn btn-primary">
              Go to the home page
            </Link>
            <Link href="/how-it-works" className="btn btn-secondary">
              How it works
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
