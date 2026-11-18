// Home-screen shortcuts: long-press Scriptor's icon for "Continue writing" (the last chapter, the caret after its last
// word) and "New novel". Static Android app shortcuts (res/xml/shortcuts.xml) that open Scriptor's own scriptor://
// links, so nothing leaves the phone. android/ is generated from app.json, so this is how they survive each build.
// The icons are Material Design Icons' feather and plus (Apache 2.0, the set the app's icons come from).
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const pkg = 'com.scriptor.app';
const gold = '#F3B63A';
const ink = '#0A0B0E';
const feather =
  'M22,2C22,2 14.36,1.63 8.34,9.88C3.72,16.21 2,22 2,22L3.94,21C5.38,18.5 6.13,17.47 7.54,16C10.07,16.74 12.71,16.65 15,14' +
  'C13,13.44 11.4,13.57 9.04,13.81C11.69,12 13.5,11.6 16,12L17,10C15.2,9.66 14,9.63 12.22,10.04C14.19,8.65 15.56,7.87 18,8' +
  'L19.21,6.07C17.65,5.96 16.71,6.13 14.92,6.57C16.53,5.11 18,4.45 20.14,4.32C20.14,4.32 21.19,2.43 22,2Z';
const plus = 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z';

/** A round gold icon with a dark glyph, the app's own colours. */
const icon = (glyph) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="48dp" android:height="48dp"
    android:viewportWidth="48" android:viewportHeight="48">
  <path android:fillColor="${gold}" android:pathData="M24,0A24,24 0 1,1 23.99,0Z"/>
  <group android:translateX="12" android:translateY="12">
    <path android:fillColor="${ink}" android:pathData="${glyph}"/>
  </group>
</vector>
`;

const shortcut = (id, label, long, iconName, data) => `  <shortcut android:shortcutId="${id}" android:enabled="true"
      android:icon="@drawable/${iconName}" android:shortcutShortLabel="@string/${id}_short"
      android:shortcutLongLabel="@string/${id}_long">
    <intent android:action="android.intent.action.VIEW" android:data="${data}"
        android:targetPackage="${pkg}" android:targetClass="${pkg}.MainActivity"/>
  </shortcut>
`;

const shortcuts = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${shortcut('continue_writing', 'Continue writing', 'Continue writing at your last line', 'shortcut_write', 'scriptor:///write?at=end')}${shortcut('new_novel', 'New novel', 'Start a new novel', 'shortcut_new', 'scriptor:///?new=1')}</shortcuts>
`;

// Shortcut labels must be string resources.
const strings = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="continue_writing_short">Continue writing</string>
  <string name="continue_writing_long">Continue writing at your last line</string>
  <string name="new_novel_short">New novel</string>
  <string name="new_novel_long">Start a new novel</string>
</resources>
`;

module.exports = function withShortcuts(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0];
    const main = app.activity.find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) throw new Error('withShortcuts: MainActivity was not found in the manifest.');
    main['meta-data'] = (main['meta-data'] ?? []).filter((m) => m.$['android:name'] !== 'android.app.shortcuts');
    main['meta-data'].push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' } });
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const res = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
      const write = (rel, text) => {
        fs.mkdirSync(path.dirname(path.join(res, rel)), { recursive: true });
        fs.writeFileSync(path.join(res, rel), text);
      };
      write('xml/shortcuts.xml', shortcuts);
      write('drawable/shortcut_write.xml', icon(feather));
      write('drawable/shortcut_new.xml', icon(plus));
      write('values/shortcut_strings.xml', strings);
      return mod;
    },
  ]);
};
