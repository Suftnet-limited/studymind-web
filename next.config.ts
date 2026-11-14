import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // serverBodySizeLimit is not needed: uploads now go browser → backend directly,
  // bypassing Render entirely. next.config.ts is kept for future server-side config.
};

export default nextConfig;
