import sharp from 'sharp';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const source = 'public/ritmo-icon-source.webp';

if (!existsSync(source)) {
  throw new Error('Ícone oficial ausente: public/ritmo-icon-source.webp');
}

await mkdir('public', { recursive: true });

await Promise.all([
  sharp(source).resize(192, 192, { fit: 'cover' }).png().toFile('public/pwa-192.png'),
  sharp(source).resize(512, 512, { fit: 'cover' }).png().toFile('public/pwa-512.png'),
]);

const androidRes = 'android/app/src/main/res';
if (existsSync(androidRes)) {
  const densities = {
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192,
  };

  for (const [density, size] of Object.entries(densities)) {
    const dir = path.join(androidRes, `mipmap-${density}`);
    await mkdir(dir, { recursive: true });
    await Promise.all([
      sharp(source).resize(size, size, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher.png')),
      sharp(source).resize(size, size, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher_round.png')),
    ]);
  }

  // O ícone fornecido já possui o formato visual final. Removemos os adaptive
  // icons do template do Capacitor para impedir zoom/corte do desenho.
  await Promise.all([
    rm(path.join(androidRes, 'mipmap-anydpi-v26/ic_launcher.xml'), { force: true }),
    rm(path.join(androidRes, 'mipmap-anydpi-v26/ic_launcher_round.xml'), { force: true }),
  ]);
}

console.log('Ícone oficial do Ritmo aplicado ao PWA e Android.');
