import type { MetadataRoute } from 'next';

const BASE = 'https://studymind-web.onrender.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE,                        lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/my-learning/register`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/sign-in`,           lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];
}
