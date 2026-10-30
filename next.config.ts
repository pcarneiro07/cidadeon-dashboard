import type { NextConfig } from 'next';

// Deploy nativo na Vercel; sem standalone, Docker ou Snowflake.
const nextConfig: NextConfig = { reactStrictMode: true };

export default nextConfig;
