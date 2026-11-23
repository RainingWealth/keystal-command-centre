// Render many stills with a single bundle: node scripts/stills.mjs <outDir> <f1,f2,...> [scale]
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [outDir, frames, scale = '0.5'] = process.argv.slice(2);
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public')});
const comp = await selectComposition({serveUrl, id: 'Explainer'});
for (const f of frames.split(',').map(Number)) {
  await renderStill({
    composition: comp,
    serveUrl,
    frame: f,
    output: path.join(outDir, `f${String(f).padStart(4, '0')}.png`),
    imageFormat: 'png',
    scale: Number(scale),
  });
}
console.log('stills done', frames);
