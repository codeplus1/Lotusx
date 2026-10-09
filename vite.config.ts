import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'newprofile.png'],
        manifest: {
          id: '/',
          name: 'LotusX Password Vault',
          short_name: 'LotusX',
          description: 'A zero-knowledge, local-first encrypted password manager and secure credential vault.',
          theme_color: '#03152F',
          background_color: '#03152F',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          clientsClaim: true,
          skipWaiting: true,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      {
        name: 'html-csp-hardening',
        transformIndexHtml(html, ctx) {
          if (ctx.server) {
            return html;
          }
          return html
            .replace(
              "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' https://accounts.google.com;",
              "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com;"
            )
            .replace(
              "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline';",
              "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com;"
            );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      headers: {
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://accounts.google.com https://www.googleapis.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.google.com https://*.run.app https://ai.studio https://*.aistudio.google.com;",
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy':
          'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), display-capture=(), magnetometer=(), gyroscope=(), accelerometer=()',
        'X-XSS-Protection': '1; mode=block',
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      headers: {
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://accounts.google.com https://www.googleapis.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.google.com https://*.run.app https://ai.studio https://*.aistudio.google.com;",
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy':
          'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), display-capture=(), magnetometer=(), gyroscope=(), accelerometer=()',
        'X-XSS-Protection': '1; mode=block',
      },
    },
  };
});
