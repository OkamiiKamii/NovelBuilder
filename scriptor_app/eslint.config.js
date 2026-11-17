// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Made by tools: the Android project (expo prebuild) and the bundled editor page (npm run build:editor).
    ignores: ['dist/*', 'android/*', 'src/editor/editorPage.generated.ts', 'src/reader/readerPage.generated.ts'],
  },
  {
    // These four check code for the React Compiler, which Scriptor does not use. The editor keeps what is being typed
    // in refs on purpose (saving must see the latest text without re-rendering), so they stay warnings.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]);
