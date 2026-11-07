// Packages the desktop app. Run after `vite build` (see `npm run app:desktop`).
//   node scripts/build-desktop.mjs            Windows (x64), this Mac, and Linux (x64)
//   node scripts/build-desktop.mjs win32      only the ones named: win32, darwin, linux
//   node scripts/build-desktop.mjs win32:arm64 win32:ia32    a platform for another processor (arm64, ia32, x64)
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';

if (!existsSync('dist/index.html')) throw new Error('Build the web app first: npm run build');
// The app carries its own copy of the built pages.
rmSync('desktop/web', { recursive: true, force: true });
cpSync('dist', 'desktop/web', { recursive: true });
rmSync('desktop/web/sw.js', { force: true });

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const electronVersion = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')).version;
const all = { win32: 'x64', darwin: process.arch === 'arm64' ? 'arm64' : 'x64', linux: 'x64' };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(all);

for (const target of wanted) {
  const [platform, arch = all[target.split(':')[0]]] = target.split(':');
  if (!all[platform] || !['x64', 'arm64', 'ia32'].includes(arch)) throw new Error(`Unknown target "${target}". Use win32, darwin or linux, optionally with :x64, :arm64 or :ia32.`);
  const [folder] = await packager({ dir: 'desktop', out: 'release/desktop', overwrite: true, platform, arch, name: 'Novel Builder', appVersion: version, electronVersion, asar: true, appBundleId: 'com.novelbuilder.app', icon: 'desktop/icon', ignore: [/^\/icon\.(png|ico|icns)$/], win32metadata: { CompanyName: 'Novel Builder', ProductName: 'Novel Builder' } });
  if (!folder) throw new Error(`The desktop engine has no ${platform} build for ${arch} processors, so this one cannot be made.`);
  // One file to carry to the other machine.
  const zip = `release/NovelBuilder-${version}-${platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux'}-${arch}.zip`;
  rmSync(zip, { force: true });
  execFileSync('ditto', ['-c', '-k', '--keepParent', folder, zip]);
  console.log(`${platform}: ${zip}`);
}
