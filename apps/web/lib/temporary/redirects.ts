// The API redirects to the paths SPEC 6.1 names (/onboarding, /home) and to
// /login or /settings with ?error=. The real pages do not exist yet, so map
// them onto the temporary pages. Query strings are preserved by Next.
// Delete this file with app/(temporary) when the real UI arrives.
export const temporaryRedirects = [
  { source: '/onboarding', destination: '/me', permanent: false },
  { source: '/home', destination: '/me', permanent: false },
  { source: '/login', destination: '/auth/error', permanent: false },
  { source: '/settings', destination: '/auth/error', permanent: false },
];
