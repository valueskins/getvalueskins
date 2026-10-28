import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SiteFooter, SiteHeader } from '@/components/shell/SiteChrome';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="status-page">
        <section className="status-card" aria-labelledby="nf-title">
          <span className="status-icon status-icon-wait" aria-hidden="true">
            <Icon name="compass" size={24} />
          </span>
          <p className="t-label c-ink-2">Error 404</p>
          <h1 id="nf-title" className="t-h1">
            This page does not exist
          </h1>
          <p className="t-body c-ink-2">
            The link may be old or mistyped. If someone sent you a link to a deal, it may have
            closed, or it belongs to other people.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn btn-primary">
              Go to the home page
            </Link>
            <Link href="/how-it-works" className="btn btn-secondary">
              How it works
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
