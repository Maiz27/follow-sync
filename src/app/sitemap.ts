import type { MetadataRoute } from 'next';
import { BASE_URL } from '@/lib/constants';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  // Public pages only — the dashboard requires sign-in and is noindex.
  const routes = ['/', '/terms', '/privacy'];

  return routes.map((route) => ({
    url: `${BASE_URL}${route === '/' ? '' : route}`,
    lastModified,
    changeFrequency: 'weekly',
    priority: route === '/' ? 1 : 0.7,
  }));
}
