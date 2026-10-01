import Link from 'next/link';
import {
  CONTINUE_WITH_INSTAGRAM,
  HOMEPAGE_BRAND_PITCH,
  HOMEPAGE_CREATOR_PITCH,
  HOMEPAGE_TAGLINE,
  SIGN_IN_WITH_EMAIL,
} from '@valueskins/shared';
import { apiUrl } from '../../lib/temporary/api';
import { isEmailLoginEnabled } from '../../lib/temporary/flags';
import { headingClass, primaryButton, secondaryButton } from './_components/styles';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className={headingClass}>{HOMEPAGE_TAGLINE}</h1>
      <div className="space-y-1 text-muted">
        <p>{HOMEPAGE_BRAND_PITCH}</p>
        <p>{HOMEPAGE_CREATOR_PITCH}</p>
      </div>
      <div className="flex flex-col gap-3">
        <a href={apiUrl('/api/auth/instagram/start')} className={primaryButton}>
          {CONTINUE_WITH_INSTAGRAM}
        </a>
        {isEmailLoginEnabled() ? (
          <Link href="/auth/email" className={secondaryButton}>
            {SIGN_IN_WITH_EMAIL}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
