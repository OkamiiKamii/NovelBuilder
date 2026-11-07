import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

import '../../../shared/domain/places/places.dart';
import '../../characters/data/portrait_image.dart' show UnreadableImage;

/// A map background too large to keep in the novel.
class ImageTooLarge implements Exception {
  @override
  String toString() => 'That image is larger than ${mapImageLimit ~/ 1024 ~/ 1024} MB, too large for a map background.';
}

/// The longest side of a background converted from a format other apps cannot show (an iPhone's HEIC photo).
const _convertedMaxEdge = 4096;

String? _mimeOf(Uint8List b) {
  bool starts(List<int> sig, [int at = 0]) =>
      b.length >= at + sig.length && [for (var i = 0; i < sig.length; i++) b[at + i] == sig[i]].every((x) => x);
  if (starts([0x89, 0x50, 0x4E, 0x47])) return 'image/png';
  if (starts([0xFF, 0xD8, 0xFF])) return 'image/jpeg';
  if (starts([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

/// An image the author chose from their device, as a map keeps it, with its size in pixels. A PNG, JPEG, GIF or WebP
/// is kept exactly as chosen (as the original app keeps it); anything else the device can read (an iPhone's HEIC
/// photo) is turned into a JPEG first, so every device that opens the novel can show it. Nothing is sent anywhere.
Future<({String url, int width, int height})> mapImage(Uint8List bytes) async {
  if (bytes.length > mapImageLimit) throw ImageTooLarge();
  final decoded = await _decodeOnDevice(bytes);
  if (decoded == null) throw UnreadableImage();
  final mime = _mimeOf(bytes);
  if (mime != null) {
    return (url: 'data:$mime;base64,${base64Encode(bytes)}', width: decoded.width, height: decoded.height);
  }
  final jpeg = await compute(_toJpeg, decoded);
  final url = 'data:image/jpeg;base64,${base64Encode(jpeg.bytes)}';
  if (url.length > mapImageLimit * 1.37) throw ImageTooLarge();
  return (url: url, width: jpeg.width, height: jpeg.height);
}

({Uint8List bytes, int width, int height}) _toJpeg(({int width, int height, Uint8List pixels}) raw) {
  final source = img.Image.fromBytes(
    width: raw.width,
    height: raw.height,
    bytes: raw.pixels.buffer,
    numChannels: 4,
    order: img.ChannelOrder.rgba,
  );
  final scale = math.min(1.0, _convertedMaxEdge / math.max(source.width, source.height));
  final width = math.max(1, (source.width * scale).round());
  final height = math.max(1, (source.height * scale).round());
  final resized = scale < 1
      ? img.copyResize(source, width: width, height: height, interpolation: img.Interpolation.average)
      : source;
  final canvas = img.Image(width: width, height: height)..clear(img.ColorRgb8(255, 255, 255));
  img.compositeImage(canvas, resized);
  return (bytes: img.encodeJpg(canvas, quality: 85), width: width, height: height);
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
