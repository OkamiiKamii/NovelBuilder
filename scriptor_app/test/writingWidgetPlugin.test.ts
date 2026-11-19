import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Mod = (c: { modRequest: object; modResults: unknown }) => Promise<{ modResults: unknown }>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withWritingWidget = require('../plugins/withWritingWidget') as (c: object) => { mods: { android: Record<string, Mod> } };

const activity = (pause = '') =>
  `class MainActivity : ReactActivity() {\n  /** Name. */\n  ${pause}override fun getMainComponentName(): String = "main"\n}\n`;
const legacy = 'override fun onPause() {\n    super.onPause()\n    ScriptorWidget.refresh(this)\n  }\n\n  ';

async function patched(contents: string): Promise<string> {
  const mods = withWritingWidget({ name: 'Scriptor', slug: 'scriptor' }).mods.android;
  return ((await mods['mainActivity']!({ modRequest: {}, modResults: { contents } })).modResults as { contents: string }).contents;
}

describe('the writing widget plugin', () => {
  test('the widget and the tile never open a database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'scriptor-widget-'));
    await withWritingWidget({ name: 'Scriptor', slug: 'scriptor' }).mods.android['dangerous']!({
      modRequest: { platformProjectRoot: root },
      modResults: undefined,
    });
    for (const name of ['ScriptorWidget.kt', 'ScriptorTile.kt']) {
      const kt = readFileSync(join(root, 'app/src/main/java/com/scriptor/app', name), 'utf8');
      expect(kt).not.toMatch(/SQLite|sqlite3|openDatabase/);
    }
    expect(readFileSync(join(root, 'app/src/main/java/com/scriptor/app/ScriptorWidget.kt'), 'utf8')).toContain(
      'File(dir, "today.json")',
    );
  });

  test('MainActivity gets one delayed onPause: fresh, over an older build, and run twice', async () => {
    for (const start of [activity(), activity(legacy)]) {
      const once = await patched(start);
      expect(once.split('override fun onPause').length).toBe(2);
      expect(once).toContain('postDelayed({ ScriptorWidget.refresh(app) }, 1500)');
      expect(once).not.toContain('ScriptorWidget.refresh(this)');
      expect(await patched(once)).toBe(once);
    }
  });

  test('an unexpected MainActivity stops the build', async () => {
    await expect(patched('class MainActivity\n')).rejects.toThrow('MainActivity was not as expected');
  });
});
