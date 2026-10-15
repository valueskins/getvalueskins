import type { NextConfig } from 'next';
import { assertSafeWebEnv } from './lib/env';

assertSafeWebEnv(process.env);

const nextConfig: NextConfig = {};

export default nextConfig;
