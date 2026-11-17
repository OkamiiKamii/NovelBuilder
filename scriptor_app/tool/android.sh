#!/usr/bin/env bash
# Builds and runs Scriptor for Android on this computer. Nothing is built in the cloud.
#
#   tool/android.sh check       typecheck, tests and Expo's project checks
#   tool/android.sh debug       build a debug APK  -> build/Scriptor-debug.apk (loads its code from `npx expo start`)
#   tool/android.sh preview     build a self-contained APK -> build/Scriptor-preview.apk (emulator only: debug key)
#   tool/android.sh emulator    start the Android emulator (if it is not running) and install the preview APK on it
#   tool/android.sh phone       build the APK for the phone, signed with the author's key in ../signing -> build/Scriptor.apk
#   tool/android.sh install-phone   install build/Scriptor.apk on the connected phone: as an update only (adb install -r),
#                               never uninstalling, and only if its signature matches the one already installed
#
# JAVA_HOME and ANDROID_HOME are set for these commands only; the computer's own settings are left alone.
# Native code is built only for the processor each build runs on: x86_64 for the emulator, arm64-v8a for the phone.
set -euo pipefail

cd "$(dirname "$0")/.."

export JAVA_HOME="${SCRIPTOR_JAVA_HOME:-$USERPROFILE/.jdks/jbr-17.0.14}"
export ANDROID_HOME="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"

# WINDOWS PATH LIMIT: native parts compiled with CMake (react-native-safe-area-context's, and later others) make file
# paths over 260 characters. That needs Windows' long paths turned on (LongPathsEnabled = 1, set 2026-11-16) and a
# Ninja that uses them: the one in CMake 3.31.6 (1.12.1), not CMake 3.22.1's (1.10.2). Install it once with
#   sdkmanager "cmake/3.31.6"
CMAKE_VERSION="3.31.6"
CMAKE_DIR="$ANDROID_HOME/cmake/$CMAKE_VERSION"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
ADB="$ANDROID_HOME/platform-tools/adb.exe"
AVD="${SCRIPTOR_AVD:-NovelBuilder_Pixel}"
PACKAGE="com.scriptor.app"

prebuild() {
  # android/ is generated from app.json and is never edited by hand.
  CI=1 npx expo prebuild --platform android --clean --no-install
  [ -d "$CMAKE_DIR" ] || { echo "CMake $CMAKE_VERSION is not in the Android SDK: sdkmanager \"cmake/$CMAKE_VERSION\"" >&2; exit 1; }
  # Gradle finds the SDK and that CMake through local.properties (paths with forward slashes).
  printf 'sdk.dir=%s\ncmake.dir=%s\n' "$(cygpath -m "$ANDROID_HOME" 2>/dev/null || echo "$ANDROID_HOME")" \
    "$(cygpath -m "$CMAKE_DIR" 2>/dev/null || echo "$CMAKE_DIR")" > android/local.properties
}

build_debug() {
  prebuild
  (cd android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64 --console=plain)
  mkdir -p build
  cp android/app/build/outputs/apk/debug/app-debug.apk build/Scriptor-debug.apk
  echo "Built: build/Scriptor-debug.apk"
}

build_preview() {
  # A release build with the app's code inside, so it runs without a development server. Signed with the debug key:
  # for the emulator only, never for the phone.
  prebuild
  (cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86_64 --console=plain)
  mkdir -p build
  cp android/app/build/outputs/apk/release/app-release.apk build/Scriptor-preview.apk
  echo "Built: build/Scriptor-preview.apk"
}

build_phone() {
  prebuild
  (cd android && ./gradlew assembleRelease -Pscriptor.signWithOwnKey=true -PreactNativeArchitectures=arm64-v8a --console=plain)
  mkdir -p build
  cp android/app/build/outputs/apk/release/app-release.apk build/Scriptor.apk
  echo "Built: build/Scriptor.apk"
  echo "Signed by: $(cert_of build/Scriptor.apk)"
}

apksigner() {
  local tools
  tools="$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)"
  "${tools}apksigner.bat" "$@"
}

# The SHA-256 of the certificate an APK is signed with.
cert_of() {
  apksigner verify --print-certs "$1" 2>/dev/null | tr -d '\r' | grep -m1 'SHA-256 digest' | sed 's/.*: //'
}

install_phone() {
  [ -f build/Scriptor.apk ] || { echo "Build it first: tool/android.sh phone" >&2; exit 1; }
  local phones
  phones="$("$ADB" devices | tr -d '\r' | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1}')"
  [ "$(echo "$phones" | grep -c .)" = "1" ] || { echo "Connect exactly one phone (USB debugging on). Found: ${phones:-none}" >&2; exit 1; }
  local serial="$phones"
  local locked
  locked="$("$ADB" -s "$serial" shell dumpsys window | tr -d '\r' | grep -o 'mDreamingLockscreen=[a-z]*' | head -1)"
  [ "$locked" = "mDreamingLockscreen=false" ] || { echo "The phone is locked: unlock it and try again." >&2; exit 1; }
  local installed
  # `pm path` fails when the app is not installed yet: that is an answer (a first install), not an error.
  installed="$({ "$ADB" -s "$serial" shell pm path "$PACKAGE" 2>/dev/null || true; } | tr -d '\r' | sed -n 's/^package://p' | head -1)"
  if [ -n "$installed" ]; then
    # Already on the phone: only a build signed with the same key may replace it (an update keeps its library).
    "$ADB" -s "$serial" pull "$installed" build/installed.apk >/dev/null
    local have want
    have="$(cert_of build/installed.apk)"
    want="$(cert_of build/Scriptor.apk)"
    rm -f build/installed.apk
    [ -n "$want" ] && [ "$have" = "$want" ] || { echo "Signatures differ (installed $have, new $want): not installing." >&2; exit 1; }
  fi
  "$ADB" -s "$serial" install -r build/Scriptor.apk
  echo "Installed on $serial"
}

emulator_serial() {
  "$ADB" devices | awk '/^emulator-[0-9]+\tdevice$/ {print $1; exit}'
}

on_emulator() {
  local serial
  serial="$(emulator_serial)"
  if [ -z "$serial" ]; then
    echo "Starting emulator $AVD..."
    "$ANDROID_HOME/emulator/emulator.exe" -avd "$AVD" -no-snapshot-save >/dev/null 2>&1 &
    "$ADB" wait-for-device
    until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
    serial="$(emulator_serial)"
  fi
  build_preview
  # The emulator only: this command never installs on a phone.
  "$ADB" -s "$serial" install -r build/Scriptor-preview.apk
  "$ADB" -s "$serial" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null
  echo "Scriptor is open on $serial"
}

case "${1:-}" in
  check) npm run -s typecheck && npx jest && npx expo-doctor ;;
  debug) build_debug ;;
  preview) build_preview ;;
  phone) build_phone ;;
  install-phone) install_phone ;;
  emulator) on_emulator ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
