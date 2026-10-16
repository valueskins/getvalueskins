import type { NextConfig } from 'next';
import { assertSafeWebEnv } from './lib/env';

assertSafeWebEnv(process.env);

const nextConfig: NextConfig = {
  // Pages render on request (the CSP nonce), so the legal and How it works markdown
  // that lib/content.ts reads must ship with the server code.
  outputFileTracingIncludes: { '/*': ['./content/**/*'] },
};

export default nextConfig;
