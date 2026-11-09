// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import { cmsImageDevPlugin, cmsImageFallback } from './src/lib/cmsImageFallback.ts';
import { lastmodForSitemapUrl } from './src/lib/gitHistory.ts';

const ngrokHost = 'star-ghost-terminally.ngrok-free.app'

// https://astro.build/config
export default defineConfig({
  site: 'https://tavistock.air-cadets.org/',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  integrations: [
    cmsImageFallback(),
    mdx(),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !['/admin', '/blog', '/join'].includes(path)
          && !path.startsWith('/admin/')
          && !path.startsWith('/cms-preview');
      },
      serialize(item) {
        const lastmod = lastmodForSitemapUrl(item.url);
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    })
  ],

  vite: {
    plugins: [tailwindcss(), cmsImageDevPlugin()],
    server: {
      allowedHosts: [ngrokHost],
      hmr: {
        clientPort: 443,
        host: ngrokHost
      }
    },
  },
});