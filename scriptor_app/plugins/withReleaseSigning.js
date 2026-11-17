// Signs Scriptor's phone builds with the author's own key, as the Flutter app does: the key stays in ../signing (beside
// the project, outside it, never copied or committed) and is read when Gradle runs. Only a build asked for with
// `-Pscriptor.signWithOwnKey=true` (tool/android.sh phone) uses it; every other build keeps the debug key, so emulator
// builds never need the key. android/ is generated from app.json, so this is how the change survives each build.
const { withAppBuildGradle } = require('@expo/config-plugins');

const marker = '// scriptor: release signing';

const signingSetup = `
${marker}
def scriptorSigningDir = new File(rootDir, '../../signing')
def scriptorSigningProps = new Properties()
def scriptorSigningFile = new File(scriptorSigningDir, 'keystore.properties')
if (scriptorSigningFile.exists()) { scriptorSigningFile.withInputStream { scriptorSigningProps.load(it) } }
def scriptorKeyName = scriptorSigningProps.getProperty('storeFile')
def scriptorKeyFile = scriptorKeyName ? new File(scriptorSigningDir, new File(scriptorKeyName).name) : null
def scriptorOwnKey = findProperty('scriptor.signWithOwnKey') == 'true'
if (scriptorOwnKey && (scriptorKeyFile == null || !scriptorKeyFile.exists())) {
    throw new GradleException('The signing key was not found in ../signing (keystore.properties and its key file).')
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes(marker)) return mod;
    gradle = gradle.replace(/^android \{/m, `${signingSetup}\nandroid {`);
    gradle = gradle.replace(
      /signingConfigs \{\n/,
      `signingConfigs {
        if (scriptorOwnKey) {
            release {
                storeFile scriptorKeyFile
                storePassword scriptorSigningProps.getProperty('storePassword')
                keyAlias scriptorSigningProps.getProperty('keyAlias')
                keyPassword scriptorSigningProps.getProperty('keyPassword')
            }
        }
`,
    );
    gradle = gradle.replace(
      /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
      '$1signingConfig scriptorOwnKey ? signingConfigs.release : signingConfigs.debug',
    );
    if (!gradle.includes('scriptorOwnKey ? signingConfigs.release')) {
      throw new Error('withReleaseSigning: the release build type was not found in app/build.gradle.');
    }
    mod.modResults.contents = gradle;
    return mod;
  });
};
