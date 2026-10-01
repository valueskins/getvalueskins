import Link from 'next/link';
import { authErrorMessage } from '../../../../lib/temporary/authErrors';
import { headingClass, secondaryButton } from '../../_components/styles';

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const code = Array.isArray(error) ? error[0] : error;

  return (
    <div className="space-y-6">
      <h1 className={headingClass}>Sign-in problem</h1>
      <p className="text-danger">{authErrorMessage(code)}</p>
      <Link href="/" className={secondaryButton}>
        Back to sign in
      </Link>
    </div>
  );
}
