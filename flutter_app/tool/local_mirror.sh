#!/bin/zsh
# Builds and device tests run from a mirror on this Mac's own disk.
#
# Why: the project lives on a network drive (SMB), and macOS refuses to code-sign apps there
# ("resource fork, Finder information, or similar detritus not allowed"). The source on the
# network drive stays the only copy anyone edits; the mirror is overwritten from it every time.
#
# Usage:
#   tool/local_mirror.sh build android|ios|ios-simulator|macos   → copies the app to ../release/flutter/<platform>/
#                                                                  (the Mac app as NovelBuilder-macOS.zip)
#   tool/local_mirror.sh test <device-id> [file]                 → runs integration_test (or one file of it) there
#   tool/local_mirror.sh unit [flutter test args]                → runs the unit and widget tests
#   tool/local_mirror.sh iphone <device-id>                      → builds, signs (your team) and installs on a
#                                                                  connected iPhone (`flutter devices` lists ids)
#
# Unit tests run from the mirror too: packages with native build hooks (sqlite3, path_provider) take a file lock that
# the network drive does not grant.
set -euo pipefail

SRC="${0:A:h:h}"
MIRROR="$HOME/Library/Caches/NovelBuilder/flutter_app"
RELEASE="${SRC:h}/release/flutter"

mkdir -p "$MIRROR"
# Generated and per-machine files are left out; --delete keeps the mirror identical to the source.
rsync -a --delete \
  --exclude build/ --exclude .dart_tool/ --exclude ios/Pods/ --exclude macos/Pods/ \
  --exclude .flutter-plugins-dependencies --exclude 'android/.gradle/' --exclude 'android/local.properties' \
  "$SRC/" "$MIRROR/"
# Release signing reads ../signing relative to the app, so the mirror gets a link to the real folder (never a copy).
ln -sfn "${SRC:h}/signing" "${MIRROR:h}/signing"
cd "$MIRROR"
flutter pub get >/dev/null

# Flutter keeps one folder of built native libraries (sqlite3, objective_c) for every iOS build, simulator or device,
# and can reuse what another build left there: a phone app then carries simulator libraries, which an iPhone refuses
# ("invalid signature"). So every iOS build starts without them, and what it made is checked before it is used.
fresh_ios_native() { rm -rf build/native_assets/ios .dart_tool/flutter_build; }

# Stops unless every framework in the app is built for $2 (IOS or IOSSIMULATOR) and, with "signed", is signed with a
# developer identity (not ad hoc), as a phone requires.
check_ios_app() {
  local app="$1" platform="$2" signed="${3:-}" framework name built
  for framework in "$app"/Frameworks/*.framework; do
    name="${${framework:t}:r}"
    [[ -f "$framework/$name" ]] || continue
    built="$(vtool -show-build "$framework/$name" 2>/dev/null | awk '$1 == "platform" {print $2; exit}')"
    if [[ -n "$built" && "$built" != "$platform" ]]; then
      echo "Stopped: $name in $app is built for $built, not $platform." >&2; exit 1
    fi
    if [[ "$signed" == signed ]] && codesign -dvv "$framework" 2>&1 | grep -q 'Signature=adhoc'; then
      echo "Stopped: $name in $app is not signed for the phone." >&2; exit 1
    fi
  done
}

case "${1:-}" in
  build)
    platform="${2:?platform: android, ios, ios-simulator or macos}"
    out="$RELEASE/$platform"
    mkdir -p "$out"
    case "$platform" in
      android)
        flutter build apk --release
        cp build/app/outputs/flutter-apk/app-release.apk "$out/NovelBuilder.apk" ;;
      ios)
        # Unsigned: installing on an iPhone needs a signing team (see README).
        fresh_ios_native
        flutter build ios --release --no-codesign
        check_ios_app build/ios/iphoneos/Runner.app IOS
        rm -rf "$out/Runner.app" && cp -R build/ios/iphoneos/Runner.app "$out/" ;;
      ios-simulator)
        fresh_ios_native
        flutter build ios --simulator --debug
        check_ios_app build/ios/iphonesimulator/Runner.app IOSSIMULATOR
        rm -rf "$out/Runner.app" && cp -R build/ios/iphonesimulator/Runner.app "$out/" ;;
      macos)
        flutter build macos --release
        # Zipped: a Mac app's frameworks rely on symbolic links, which the network drive cannot store in a form macOS
        # loads (a loose copy there crashes on launch). Unzip it on the Mac, e.g. into Applications.
        rm -rf "$out/Novel Builder.app" "$out/NovelBuilder-macOS.zip"
        ditto -c -k --sequesterRsrc --keepParent "build/macos/Build/Products/Release/Novel Builder.app" "$out/NovelBuilder-macOS.zip" ;;
      *) echo "Unknown platform: $platform" >&2; exit 2 ;;
    esac
    # Copying back to the network drive adds Finder metadata; strip it so the app still opens.
    xattr -cr "$out" 2>/dev/null || true
    echo "Built $platform → $out" ;;
  test)
    device="${2:?device id, e.g. macos}"
    [[ "$device" == macos || "$device" == emulator-* ]] || fresh_ios_native
    flutter test "${3:-integration_test}" -d "$device" ;;
  unit)
    shift
    flutter test "$@" ;;
  iphone)
    # A free Apple ID team only signs for devices Apple has seen: building with the phone as the destination lets
    # Xcode register it and make the profile. The first launch then needs the author to trust the developer on the
    # phone (Settings → General → VPN & Device Management).
    device="${2:?device id of the connected iPhone (xcrun devicectl list devices)}"
    app=build/ios-device/Build/Products/Release-iphoneos/Runner.app
    fresh_ios_native
    rm -rf "$app"
    flutter build ios --release --config-only
    xcodebuild -workspace ios/Runner.xcworkspace -scheme Runner -configuration Release -destination "id=$device" \
      -allowProvisioningUpdates -allowProvisioningDeviceRegistration -derivedDataPath build/ios-device build -quiet
    check_ios_app "$app" IOS signed
    xcrun devicectl device install app --device "$device" "$app"
    xcrun devicectl device process launch --device "$device" com.novelbuilder.flutter || \
      echo "Installed. If it did not open: on the iPhone, Settings → General → VPN & Device Management → trust the developer." ;;
  *)
    echo "Usage: $0 build <android|ios|ios-simulator|macos> | test <device-id> | unit [args] | iphone <device-id>" >&2; exit 2 ;;
esac
