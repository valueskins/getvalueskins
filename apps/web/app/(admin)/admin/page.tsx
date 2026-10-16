import { redirect } from 'next/navigation';
import { ADMIN_HOME } from '@/lib/access';

export default function Page() {
  redirect(ADMIN_HOME);
}
