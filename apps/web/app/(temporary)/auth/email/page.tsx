import { headingClass } from '../../_components/styles';
import { EmailStartForm } from '../../_components/EmailStartForm';

export default function EmailSignInPage() {
  return (
    <div className="space-y-6">
      <h1 className={headingClass}>Sign in with email</h1>
      <EmailStartForm />
    </div>
  );
}
