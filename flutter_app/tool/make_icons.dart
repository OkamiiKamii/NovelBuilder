// Makes the app's icons for every platform from one picture, tool/icon/novel_builder_icon.jpg: a golden tree on dark
// stone in a gold-framed rounded square, on a light grey ground. Run from flutter_app/: dart run tool/make_icons.dart
//
//   Windows (.ico), macOS, Android before 8: the framed square, with the grey around it made transparent.
//   Android 8 and later (adaptive): the dark interior, small enough that every launcher shape (circle, squircle,
//     square…) keeps the whole tree, on a background of the same dark; the launcher draws its own outline.
//   iPhone and iPad: the interior, square and opaque; iOS rounds the corners itself and allows no transparency.
import 'dart:io';
import 'dart:math' as math;

import 'package:image/image.dart' as img;

/// Where the gold frame and the dark interior are in the source picture (measured on it; 1024 × 1024).
const _frame = (left: 96, top: 96, right: 928, bottom: 928);
const _interior = (left: 122, top: 122, right: 902, bottom: 902);

/// The interior's corners are rounded inside the frame; outside this radius they are filled with the stone's dark.
const _interiorRadius = 100.0;

void main() {
  final src = img.decodeJpg(File('tool/icon/novel_builder_icon.jpg').readAsBytesSync())!;
  if (src.width != 1024 || src.height != 1024) throw StateError('Expected a 1024 × 1024 picture.');

  final framed = _framed(src);
  final dark = _darkOf(src);
  final interior = _interiorOf(src, dark);
  String hex(img.Color c) =>
      '#${[c.r, c.g, c.b].map((v) => v.toInt().toRadixString(16).padLeft(2, '0')).join().toUpperCase()}';

  // ---- Android
  const res = 'android/app/src/main/res';
  const legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192};
  for (final MapEntry(key: d, value: size) in legacy.entries) {
    _png('$res/mipmap-$d/ic_launcher.png', _resize(framed, size));
  }
  const adaptive = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432};
  for (final MapEntry(key: d, value: size) in adaptive.entries) {
    _png('$res/mipmap-$d/ic_launcher_foreground.png', _foreground(interior, size, dark));
  }
  Directory('$res/mipmap-anydpi-v26').createSync(recursive: true);
  File('$res/mipmap-anydpi-v26/ic_launcher.xml').writeAsStringSync('''<?xml version="1.0" encoding="utf-8"?>
<!-- Made by tool/make_icons.dart. The launcher cuts the icon to its own shape; the tree stays inside every one. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
''');
  File('$res/values/ic_launcher_background.xml').writeAsStringSync('''<?xml version="1.0" encoding="utf-8"?>
<!-- Made by tool/make_icons.dart: the dark of the icon's stone. -->
<resources>
    <color name="ic_launcher_background">${hex(dark)}</color>
</resources>
''');

  // ---- Windows
  final ico = img.IcoEncoder().encodeImages([for (final s in [16, 24, 32, 48, 64, 128, 256]) _resize(framed, s)]);
  File('windows/runner/resources/app_icon.ico').writeAsBytesSync(ico);

  // ---- macOS: the framed square on Apple's grid (824 of 1024, centred), transparent around.
  const mac = 'macos/Runner/Assets.xcassets/AppIcon.appiconset';
  final macCanvas = img.Image(width: 1024, height: 1024, numChannels: 4)..clear(img.ColorRgba8(0, 0, 0, 0));
  img.compositeImage(macCanvas, _resize(framed, 824), dstX: 100, dstY: 100);
  for (final s in [16, 32, 64, 128, 256, 512, 1024]) {
    _png('$mac/app_icon_$s.png', _resize(macCanvas, s));
  }

  // ---- iPhone and iPad: opaque squares of the interior.
  const ios = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';
  final opaque = img.Image(width: interior.width, height: interior.height, numChannels: 3)..clear(dark);
  img.compositeImage(opaque, interior);
  const iosSizes = {
    'Icon-App-20x20@1x.png': 20,
    'Icon-App-20x20@2x.png': 40,
    'Icon-App-20x20@3x.png': 60,
    'Icon-App-29x29@1x.png': 29,
    'Icon-App-29x29@2x.png': 58,
    'Icon-App-29x29@3x.png': 87,
    'Icon-App-40x40@1x.png': 40,
    'Icon-App-40x40@2x.png': 80,
    'Icon-App-40x40@3x.png': 120,
    'Icon-App-60x60@2x.png': 120,
    'Icon-App-60x60@3x.png': 180,
    'Icon-App-76x76@1x.png': 76,
    'Icon-App-76x76@2x.png': 152,
    'Icon-App-83.5x83.5@2x.png': 167,
    'Icon-App-1024x1024@1x.png': 1024,
  };
  for (final MapEntry(key: name, value: size) in iosSizes.entries) {
    _png('$ios/$name', _resize(opaque, size));
  }
  stdout.writeln('Icons written. Background dark: ${hex(dark)}.');
}

void _png(String path, img.Image image) {
  File(path)
    ..parent.createSync(recursive: true)
    ..writeAsBytesSync(img.encodePng(image));
}

img.Image _resize(img.Image image, int size) =>
    img.copyResize(image, width: size, height: size, interpolation: img.Interpolation.average);

/// The frame's square, with the light neutral grey around the rounded frame (and its soft shadow) made transparent.
/// Found by filling from the corners through neutral pixels (the frame is gold, the inside dark), then softened by a
/// pixel so the edge is not jagged.
img.Image _framed(img.Image src) {
  final w = _frame.right - _frame.left;
  final crop = img.copyCrop(src, x: _frame.left, y: _frame.top, width: w, height: w).convert(numChannels: 4);
  bool neutral(int x, int y) {
    final p = crop.getPixel(x, y);
    final hi = math.max(p.r, math.max(p.g, p.b));
    final lo = math.min(p.r, math.min(p.g, p.b));
    return hi - lo < 22 && (p.r + p.g + p.b) / 3 > 70;
  }

  final outside = List.filled(w * w, false);
  final todo = <int>[0, w - 1, (w - 1) * w, w * w - 1];
  while (todo.isNotEmpty) {
    final i = todo.removeLast();
    if (outside[i]) continue;
    final x = i % w, y = i ~/ w;
    if (!neutral(x, y)) continue;
    outside[i] = true;
    if (x > 0) todo.add(i - 1);
    if (x < w - 1) todo.add(i + 1);
    if (y > 0) todo.add(i - w);
    if (y < w - 1) todo.add(i + w);
  }
  for (var y = 0; y < w; y++) {
    for (var x = 0; x < w; x++) {
      final i = y * w + x;
      if (outside[i]) {
        crop.getPixel(x, y).a = 0;
        continue;
      }
      // A pixel at the edge, beside the ground: half see-through, so the outline is smooth when scaled down.
      final edge = (x > 0 && outside[i - 1]) ||
          (x < w - 1 && outside[i + 1]) ||
          (y > 0 && outside[i - w]) ||
          (y < w - 1 && outside[i + w]);
      if (edge) crop.getPixel(x, y).a = 128;
    }
  }
  return crop;
}

/// The dark of the stone: the average of the interior just inside the frame, along its four sides.
img.Color _darkOf(img.Image src) {
  var r = 0.0, g = 0.0, b = 0.0, n = 0;
  void add(int x, int y) {
    final p = src.getPixel(x, y);
    r += p.r;
    g += p.g;
    b += p.b;
    n++;
  }

  for (var t = 300; t < 724; t += 4) {
    add(_interior.left + 12, t);
    add(_interior.right - 12, t);
    add(t, _interior.top + 12);
  }
  return img.ColorRgb8((r / n).round(), (g / n).round(), (b / n).round());
}

/// The interior inside the frame, with its rounded corners filled with the stone's dark so no gold shows there.
img.Image _interiorOf(img.Image src, img.Color dark) {
  final w = _interior.right - _interior.left;
  final crop = img.copyCrop(src, x: _interior.left, y: _interior.top, width: w, height: w).convert(numChannels: 4);
  const r = _interiorRadius;
  for (var y = 0; y < w; y++) {
    for (var x = 0; x < w; x++) {
      final cx = x < r ? r : (x > w - 1 - r ? w - 1 - r : x.toDouble());
      final cy = y < r ? r : (y > w - 1 - r ? w - 1 - r : y.toDouble());
      final d = math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d > r - 2) {
        // Blended over two pixels into the dark, so the filled corner has no hard edge.
        final t = ((d - (r - 2)) / 2).clamp(0.0, 1.0);
        final p = crop.getPixel(x, y);
        p
          ..r = p.r * (1 - t) + dark.r * t
          ..g = p.g * (1 - t) + dark.g * t
          ..b = p.b * (1 - t) + dark.b * t;
      }
    }
  }
  return crop;
}

/// Android's adaptive foreground: the interior at two thirds of the 108dp canvas (the 72dp every launcher shows, with
/// the tree inside the 66dp every shape keeps), its edge faded into the background's dark so no seam shows.
img.Image _foreground(img.Image interior, int size, img.Color dark) {
  final inner = (size * 2 / 3).round();
  final art = _resize(interior, inner);
  final fade = math.max(2, (inner * 0.04).round());
  for (var y = 0; y < inner; y++) {
    for (var x = 0; x < inner; x++) {
      final edge = math.min(math.min(x, y), math.min(inner - 1 - x, inner - 1 - y));
      if (edge < fade) art.getPixel(x, y).a = 255 * edge / fade;
    }
  }
  final canvas = img.Image(width: size, height: size, numChannels: 4)..clear(img.ColorRgba8(0, 0, 0, 0));
  img.compositeImage(canvas, art, dstX: (size - inner) ~/ 2, dstY: (size - inner) ~/ 2);
  return canvas;
}
