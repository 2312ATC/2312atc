// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

const ngrokHost = 'star-ghost-terminally.ngrok-free.app'
const excludePaths = ['/admin', '/blog', '/join'];

// https://astro.build/config
export default defineConfig({
  site: 'https://tavistock.air-cadets.org/',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !excludePaths.includes(new URL(page).pathname),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: [ngrokHost],
      hmr: {
        clientPort: 443,
        host: ngrokHost
      }
    },
  },
});