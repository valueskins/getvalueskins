import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/cx';
import { instagramLinkUrl, instagramSignInUrl } from '@/lib/signIn';

/** A plain link: sign-in leaves the app for the API and Instagram, then comes back. */
export function InstagramButton({
  label = 'Sign in with Instagram',
  link = false,
  large = false,
  block = false,
  variant = 'primary',
}: {
  label?: string;
  link?: boolean;
  large?: boolean;
  block?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <a
      href={link ? instagramLinkUrl() : instagramSignInUrl()}
      className={cx(
        'btn',
        `btn-${variant}`,
        block && 'btn-block',
        large && 'h-[52px] px-6 text-base',
      )}
    >
      <Icon name="instagram" />
      {label}
    </a>
  );
}
