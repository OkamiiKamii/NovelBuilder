import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/text/book_setting.dart';

void main() {
  test('scene breaks as writers type them', () {
    for (final t in ['***', '* * *', '#', '  ~~~  ', '⁂', '• • •', '*-*-*']) {
      expect(isSceneBreak(t), isTrue, reason: t);
    }
    for (final t in ['', '---', '— —', '*Really*', 'The end.', '# Heading', '1 * 2']) {
      expect(isSceneBreak(t), isFalse, reason: t);
    }
  });

  group('chapterOpening', () {
    String parts(String text) {
      final o = chapterOpening(text)!;
      return '${text.substring(0, o.initialEnd)}|${text.substring(o.initialEnd, o.capsEnd)}|';
    }

    test('the first letter raised, the rest of the first words in small capitals', () {
      expect(parts('The bell in the Wardens’ tower had not rung.'), 'T|he bell in the|');
    });

    test('stops at the first comma or stop', () {
      expect(parts('A top of the Mimir Forest, a figure was flying.'), 'A| top of the Mimir|');
      expect(parts('Rain, and then nothing.'), 'R|ain|');
      expect(parts('Go.'), 'G|o|');
    });

    test('an opening quotation mark goes up with the letter; the small capitals stop at the closing one', () {
      expect(parts('“Wren,” Master Marrow said.'), '“W|ren|');
      expect(parts('"Here you go." The receptionist gave it.'), '"H|ere you go|');
    });

    test('nothing to raise without a letter to begin with', () {
      expect(chapterOpening('— and then she was gone.'), isNull);
      expect(chapterOpening('   '), isNull);
    });
  });
}
