import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/characters/data/portrait_image.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';

img.Image _decoded(String dataUrl) {
  expect(dataUrl, startsWith('data:image/jpeg;base64,'));
  return img.decodeJpg(base64Decode(dataUrl.substring(dataUrl.indexOf(',') + 1)))!;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('a large picture is kept at 800 pixels on its longest side, as a JPEG the novel accepts', () async {
    final big = img.Image(width: 2400, height: 1200)..clear(img.ColorRgb8(200, 30, 30));
    final url = await portraitDataUrl(Uint8List.fromList(img.encodePng(big)));
    final out = _decoded(url);
    expect((out.width, out.height), (800, 400));
    expect(normalizeImage(url), url, reason: 'within the size the original allows');
    expect(url.length, lessThan(200000));
  });

  test('a small picture keeps its size; transparency becomes white', () async {
    final clear = img.Image(width: 40, height: 60, numChannels: 4)..clear(img.ColorRgba8(0, 0, 0, 0));
    final out = _decoded(await portraitDataUrl(Uint8List.fromList(img.encodePng(clear))));
    expect((out.width, out.height), (40, 60));
    final p = out.getPixel(20, 30);
    expect([p.r, p.g, p.b].every((c) => c > 245), isTrue, reason: 'white, not black');
  });

  test('something that is not a picture is refused with a reason, and nothing is made', () async {
    await expectLater(
      portraitDataUrl(Uint8List.fromList(utf8.encode('not a picture'))),
      throwsA(isA<UnreadableImage>()),
    );
  });
}
