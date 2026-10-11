import { apiUrl } from '../../../../lib/temporary/api';
import { hintClass, primaryButton } from '../styles';

/** The first step for an email-only account: the role comes from Instagram, so it must connect (REPLACEMENT_PLAN 2.3). */
export function ConnectInstagram() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Connect Instagram</h2>
      <p className={hintClass}>
        Your account type, Business or Creator, comes from your Instagram account. You cannot finish
        setting up until it is connected.
      </p>
      <a href={apiUrl('/api/auth/instagram/start?link=1')} className={primaryButton}>
        Connect Instagram
      </a>
    </div>
  );
}
