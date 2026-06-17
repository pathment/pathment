import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svg = readFileSync(join(root, 'public/favicon.svg'));

const sizes = [
  { name: 'assets/favicon-16x16.png', size: 16 },
  { name: 'assets/favicon-32x32.png', size: 32 },
  { name: 'assets/apple-touch-icon.png', size: 180 },
  { name: 'assets/android-chrome-192x192.png', size: 192 },
  { name: 'assets/android-chrome-512x512.png', size: 512 },
];

for (const { name, size } of sizes) {
  const png = await sharp(svg, { density: Math.max(72, size * 4) })
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(join(root, 'public', name), png);
  console.log(`wrote ${name}`);
}

const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
  icoSizes.map((size) =>
    sharp(svg, { density: size * 4 })
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);

// Multi-size ICO: use 32px as primary favicon.ico (widest browser support)
writeFileSync(join(root, 'public/favicon.ico'), icoImages[1]);
console.log('wrote favicon.ico');
