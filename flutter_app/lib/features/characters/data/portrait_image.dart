import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

/// The longest side of a stored portrait, as the original app kept it.
const portraitMaxEdge = 800;

/// A picture that could not be read as an image.
class UnreadableImage implements Exception {
  @override
  String toString() => 'That picture could not be read. Choose a JPEG, PNG, WebP, GIF or HEIC file.';
}

/// An uploaded picture as the novel keeps it: at most [portraitMaxEdge] pixels on its longest side, turned upright
/// (from its EXIF orientation), on white where it was transparent, as a JPEG data URL (quality 0.85), the same as the
/// original app. Small enough to live in the library and in backups. Nothing is sent anywhere.
Future<String> portraitDataUrl(Uint8List bytes) async {
  // The pure-Dart decoder reads JPEG, PNG, WebP, GIF, BMP and TIFF, off the screen's thread.
  final jpeg = await compute(_fromEncoded, bytes);
  if (jpeg != null) return 'data:image/jpeg;base64,${base64Encode(jpeg)}';
  // Anything else the device can decode (an iPhone's HEIC photos): decoded by the platform, then encoded the same way.
  final rgba = await _decodeOnDevice(bytes);
  if (rgba == null) throw UnreadableImage();
  final encoded = await compute(_fromRgba, rgba);
  return 'data:image/jpeg;base64,${base64Encode(encoded)}';
}

Uint8List? _fromEncoded(Uint8List bytes) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return null;
  return _encode(img.bakeOrientation(decoded));
}

Uint8List _fromRgba(({int width, int height, Uint8List pixels}) raw) => _encode(
  img.Image.fromBytes(
    width: raw.width,
    height: raw.height,
    bytes: raw.pixels.buffer,
    numChannels: 4,
    order: img.ChannelOrder.rgba,
  ),
);

Uint8List _encode(img.Image source) {
  final scale = math.min(1.0, portraitMaxEdge / math.max(source.width, source.height));
  final width = math.max(1, (source.width * scale).round());
  final height = math.max(1, (source.height * scale).round());
  final resized = scale < 1
      ? img.copyResize(source, width: width, height: height, interpolation: img.Interpolation.average)
      : source;
  // JPEG has no transparency: what was see-through becomes white, as on the original app's canvas.
  final canvas = img.Image(width: width, height: height)..clear(img.ColorRgb8(255, 255, 255));
  img.compositeImage(canvas, resized);
  return img.encodeJpg(canvas, quality: 85);
}

Future<({int width, int height, Uint8List pixels})?> _decodeOnDevice(Uint8List bytes) async {
  try {
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final image = frame.image;
    final data = await image.toByteData(format: ui.ImageByteFormat.rawStraightRgba);
    final result = data == null ? null : (width: image.width, height: image.height, pixels: data.buffer.asUint8List());
    image.dispose();
    codec.dispose();
    return result;
  } on Object {
    return null;
  }
}
