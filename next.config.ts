import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // serverBodySizeLimit is not needed: uploads now go browser → backend directly,
  // bypassing Render entirely.
};

export default nextConfig;
