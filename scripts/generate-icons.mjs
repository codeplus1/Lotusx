#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * LotusX PWA and App Icon Generator
 * Renders the brand SVG into standard PWA PNG assets:
 * - pwa-192x192.png
 * - pwa-512x512.png
 * - pwa-maskable-512x512.png (padded for Android maskable safe-zone)
 * - apple-touch-icon.png (180x180)
 * - favicon.ico (32x32)
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT_DIR = process.cwd();
const SVG_PATH = path.join(ROOT_DIR, 'public', 'icon.svg');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

async function generate() {
  console.log('🌸 Generating LotusX brand icon assets...');

  if (!fs.existsSync(SVG_PATH)) {
    console.error('❌ public/icon.svg not found!');
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);

  // 1. Standard 512x512 icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'pwa-512x512.png'));
  console.log('  ✓ Generated pwa-512x512.png');

  // 2. Standard 192x192 icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'pwa-192x192.png'));
  console.log('  ✓ Generated pwa-192x192.png');

  // 3. Apple Touch Icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
  console.log('  ✓ Generated apple-touch-icon.png');

  // 4. Favicon (32x32 png, and copy/write as favicon.ico)
  const faviconBuffer = await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), faviconBuffer);
  console.log('  ✓ Generated favicon.ico');

  // 5. Maskable 512x512 icon:
  // Android crops maskable icons to circles or squircles. We must ensure a 10-15% safe zone.
  // We create a solid/gradient full-bleed canvas and place the resized icon (80% size) centered.
  const innerSize = Math.round(512 * 0.78); // ~400px
  const innerIconBuffer = await sharp(svgBuffer)
    .resize(innerSize, innerSize)
    .png()
    .toBuffer();

  const background = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 3, g: 21, b: 47, alpha: 1 }, // LotusX Dark Navy #03152F
    },
  })
    .png()
    .toBuffer();

  const offset = Math.round((512 - innerSize) / 2);

  await sharp(background)
    .composite([
      {
        input: innerIconBuffer,
        top: offset,
        left: offset,
      },
    ])
    .png()
    .toFile(path.join(PUBLIC_DIR, 'pwa-maskable-512x512.png'));
  console.log('  ✓ Generated pwa-maskable-512x512.png (Safe-zone padded)');

  // Also sync to dist if dist exists
  const DIST_DIR = path.join(ROOT_DIR, 'dist');
  if (fs.existsSync(DIST_DIR)) {
    const iconFiles = [
      'pwa-512x512.png',
      'pwa-192x192.png',
      'apple-touch-icon.png',
      'favicon.ico',
      'pwa-maskable-512x512.png',
      'icon.svg',
    ];
    for (const f of iconFiles) {
      const src = path.join(PUBLIC_DIR, f);
      const dest = path.join(DIST_DIR, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }
    console.log('  ✓ Synced all brand icons to dist/');
  }

  console.log('✅ All LotusX brand icons generated successfully!');
}

generate().catch((err) => {
  console.error('❌ Icon generation failed:', err);
  process.exit(1);
});
