// Draws the app's icon (an open book on the app's rust red) and writes it in every size Android and the desktop
// builds need. Run once, or again after changing the drawing below:  node scripts/make-icons.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const COLOUR = '#b4532a';
// The book alone, drawn in a 100-unit square with room around it.
const book = `<g fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
  <path d="M50 34c-7-5-17-7-27-7v40c10 0 20 2 27 7 7-5 17-7 27-7V27c-10 0-20 2-27 7z"/><path d="M50 34v40"/>
  <path d="M31 39c4 .4 8 1.3 12 2.8M31 49c4 .4 8 1.3 12 2.8M69 39c-4 .4-8 1.3-12 2.8M69 49c-4 .4-8 1.3-12 2.8" stroke-width="3"/></g>`;
const svg = (inner, size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${inner}</svg>`;
const full = (radius) => `<rect width="100" height="100" rx="${radius}" fill="${COLOUR}"/>${book}`;
// Android draws the foreground at 108 units and shows the middle 72: the book is scaled into that safe area.
const foreground = `<g transform="translate(50 50) scale(0.62) translate(-50 -50)">${book}</g>`;

const browser = await chromium.launch();
const page = await browser.newPage();
const png = async (markup, size) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(markup, size)}</body>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
};

const res = 'android/app/src/main/res';
for (const [density, legacy, adaptive] of [['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]]) {
  writeFileSync(`${res}/mipmap-${density}/ic_launcher.png`, await png(full(18), legacy));
  writeFileSync(`${res}/mipmap-${density}/ic_launcher_round.png`, await png(full(50), legacy));
  writeFileSync(`${res}/mipmap-${density}/ic_launcher_foreground.png`, await png(foreground, adaptive));
}
writeFileSync(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${COLOUR.toUpperCase()}</color>\n</resources>\n`);

// The screen shown for a moment while the app starts: the icon on the app's paper colour, at each size Android asks for.
for (const dir of readdirSync(res).filter((name) => name.startsWith('drawable'))) {
  const file = `${res}/${dir}/splash.png`;
  if (!existsSync(file)) continue;
  const [, width, height] = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString().match(/pixelWidth: (\d+)[\s\S]*pixelHeight: (\d+)/).map(Number);
  const mark = Math.round(Math.min(width, height) * 0.28);
  await page.setViewportSize({ width, height });
  await page.setContent(`<body style="margin:0;background:#f6f3ee;display:grid;place-items:center;height:100vh">${svg(full(22), mark)}</body>`);
  writeFileSync(file, await page.screenshot());
}

// The web version, for when a browser installs it: plain icons, and one that fills its square for Android to shape.
mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', await png(full(22), 192));
writeFileSync('public/icon-512.png', await png(full(22), 512));
writeFileSync('public/icon-maskable-512.png', await png(`<rect width="100" height="100" fill="${COLOUR}"/><g transform="translate(50 50) scale(0.72) translate(-50 -50)">${book}</g>`, 512));

// Desktop: a PNG for Linux, an .ico for Windows (a PNG inside the small .ico wrapper), an .icns for the Mac.
const big = await png(full(22), 1024);
writeFileSync('desktop/icon.png', big);
const p256 = await png(full(22), 256);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(p256.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync('desktop/icon.ico', Buffer.concat([header, p256]));
if (process.platform === 'darwin') {
  const set = 'desktop/icon.iconset';
  rmSync(set, { recursive: true, force: true });
  mkdirSync(set);
  for (const size of [16, 32, 128, 256, 512]) {
    writeFileSync(`${set}/icon_${size}x${size}.png`, await png(full(22), size));
    writeFileSync(`${set}/icon_${size}x${size}@2x.png`, await png(full(22), size * 2));
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', 'desktop/icon.icns']);
  rmSync(set, { recursive: true, force: true });
}
await browser.close();
console.log(`icons written (${readFileSync('desktop/icon.png').length} bytes at 1024px)`);
