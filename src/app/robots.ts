import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/my-learning/', '/dashboard/', '/lecturer/', '/billing/'],
      },
    ],
    sitemap: 'https://ciquis.com/sitemap.xml',
  };
}
