import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Allow large file uploads (semester booklets can be 100 MB+).
    // Next.js defaults to 4 MB for API route bodies; lecturers uploading
    // full course PDFs or DOCX files need far more headroom.
    serverBodySizeLimit: '200mb',
  },
};

export default nextConfig;
