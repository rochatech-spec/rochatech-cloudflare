import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('public', { recursive: true });
await sharp('public/pwa-192.svg').resize(192, 192).png().toFile('public/pwa-192.png');
await sharp('public/pwa-512.svg').resize(512, 512).png().toFile('public/pwa-512.png');
console.log('Ícones PWA gerados.');
