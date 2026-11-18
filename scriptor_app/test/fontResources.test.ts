// The editor and reader pages (WebViews) load the app's fonts from file:///android_res/font/, by the names expo-font's
// font families give the files (app.json). If a font file or the plugin's naming changes, the pages would quietly fall
// back to the phone's own serif: this keeps the names in step.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

// The plugin's own naming (its package exports do not list the file, so it is read by path).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toValidAndroidResourceName } = require(join(root, 'node_modules/expo-font/plugin/build/utils.js')) as {
  toValidAndroidResourceName: (v: string) => string;
};

function resourceFiles(): Set<string> {
  const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
  const plugin = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-font');
  const families: { path?: string; fontDefinitions: { path?: string }[] }[] = plugin[1].android.fonts;
  const paths = families.flatMap((f) => f.fontDefinitions.map((d) => d.path ?? f.path ?? ''));
  return new Set(paths.map((p) => `${toValidAndroidResourceName(p)}.ttf`));
}

test.each(['build-editor.mjs', 'build-reader.mjs'])('every font %s loads is one expo-font puts in the app', (script) => {
  const source = readFileSync(join(root, 'tool', script), 'utf8');
  const used = [...source.matchAll(/file:\/\/\/android_res\/font\/([a-z0-9_]+\.ttf)/g)].map((m) => m[1]);
  expect(used.length).toBeGreaterThan(0);
  const shipped = resourceFiles();
  for (const file of used) expect(shipped).toContain(file);
});
