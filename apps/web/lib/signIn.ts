import { apiUrl } from './api/client';

/** Instagram sign-in starts on the API, which redirects to Instagram (SPEC 6.1). */
export function instagramSignInUrl(): string {
  return apiUrl('/auth/instagram/start');
}

/** Link mode: an email-only account connects its Instagram (staging only). */
export function instagramLinkUrl(): string {
  return apiUrl('/auth/instagram/start?link=1');
}
