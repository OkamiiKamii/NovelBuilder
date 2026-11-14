import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/likeness.dart';

void main() {
  Likeness of(Map<String, String> fields) => likenessOf({for (final e in fields.entries) e.key.toLowerCase(): e.value});

  test('hair: its colour, how it is worn, curls', () {
    final l = of({'Hair': 'Long, curly black'});
    expect((l.hair, l.cut, l.curly), ('black', HairCut.long, true));
    expect(of({'Hair': 'cropped silver'}).cut, HairCut.cropped);
    expect(of({'Hair': 'Bald'}), predicate<Likeness>((l) => l.cut == HairCut.bald && l.hair == null));
    expect(of({'Hair': 'two auburn braids'}), predicate<Likeness>((l) => l.cut == HairCut.braid && l.hair == 'red'));
    expect(of({'Hair': 'brown'}).cut, isNull, reason: 'no cut said: none guessed');
  });

  test('eyes and skin; a creature’s skin by its colour; nothing said is nothing', () {
    expect(of({'Eyes': 'Storm-grey'}).eyes, 'grey');
    expect(of({'Skin': 'Olive, sun-browned'}).skin, SkinTone.olive);
    expect(of({'Skin': 'deep brown'}).skin, isIn([SkinTone.brown, SkinTone.deep]));
    final lizard = of({'Skin': 'pale green scales'});
    expect((lizard.skin, lizard.skinFamily), (null, 'green'));
    expect(of({'Skin': 'None', 'Eyes': 'n/a', 'Hair': '-'}), unsaid);
    expect(of({}), unsaid);
    expect(painted(unsaid), isFalse);
  });

  test('marks: from the features, the clothing and the scars; "no beard" is no beard', () {
    final l = of({
      'Distinguishing Features': 'Wire spectacles, freckles, no beard',
      'Clothing': 'A hooded grey cloak and a circlet',
      'Scars': 'A line through the left brow',
      'Build': 'Slight',
    });
    expect(
      [l.glasses, l.freckles, l.beard, l.hood, l.crown, l.scar, l.slight, l.broad],
      [
        true, true, false, true, true, true, true, false, //
      ],
    );
    expect(of({'Distinguishing Features': 'A grey moustache and an eyepatch'}).moustache, isTrue);
    expect(of({'Distinguishing Features': 'An eye-patch'}).eyepatch, isTrue);
  });

  test('written as words and read back: the same face', () {
    const face = (
      hair: 'red',
      cut: HairCut.long,
      curly: true,
      eyes: 'green',
      skin: SkinTone.olive,
      skinFamily: null,
      beard: false,
      moustache: false,
      glasses: true,
      scar: true,
      eyepatch: false,
      freckles: true,
      hood: false,
      crown: false,
      broad: false,
      slight: false,
    );
    final w = wordsFor(face);
    expect((w.hair, w.eyes, w.skin), ('Long, curly red', 'Green', 'Olive'));
    final back = of({'Hair': w.hair!, 'Eyes': w.eyes!, 'Skin': w.skin!, 'Distinguishing Features': w.marks.join(', ')});
    expect(back, face);
  });

  test('a paragraph of their looks: hair and eyes from it when they have no field of their own, marks too', () {
    final l = of({'Physical Appearance': 'Tall, with dark curly hair, sharp grey eyes and a thin scar.'});
    expect((l.hair, l.curly, l.eyes, l.scar), ('dark', true, 'grey', true));
    final own = of({'Hair': 'Red', 'Physical Appearance': 'Long black hair.'});
    expect(own.hair, 'red', reason: 'the field of its own first');
  });
}
