// Writes the original app's ten built-in genre modules, exactly as it defines them, into a Dart file for the Flutter
// rebuild (lib/shared/domain/modules/builtin_modules.g.dart). Data only: names, categories, fields and tool descriptions.
// Run as the golden scripts: GOLDEN_OUT=<flutter_app/lib/shared/domain/modules> npx vitest run golden/modules_builtin.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { BUILTIN_MODULES } from '@/modules/extensions/builtin';

test('builtin modules', () => {
  const json = JSON.stringify(BUILTIN_MODULES);
  if (json.includes("'''")) throw new Error('cannot be written as a raw Dart string');
  const dart = [
    '// GENERATED from the original app\'s src/modules/extensions/builtin.ts by tool/golden/modules_builtin.test.ts.',
    '// Do not edit by hand: change the script\'s source and run it again.',
    '',
    '/// The ten genre modules that come with the app, as data.',
    `const builtinModulesJson = r'''${json}''';`,
    '',
  ].join('\n');
  mkdirSync(process.env.GOLDEN_OUT!, { recursive: true });
  writeFileSync(join(process.env.GOLDEN_OUT!, 'builtin_modules.g.dart'), dart);
});
