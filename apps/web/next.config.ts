import type { NextConfig } from 'next';
import { assertSafeWebEnv } from './lib/temporary/envGuard';
import { temporaryRedirects } from './lib/temporary/redirects';

assertSafeWebEnv(process.env);

const nextConfig: NextConfig = {
  async redirects() {
    return temporaryRedirects;
  },
};

export default nextConfig;
