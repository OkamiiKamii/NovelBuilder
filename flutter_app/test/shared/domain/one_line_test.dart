import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/one_line.dart';

const _cast = [(id: 'kai', name: 'Kai Doyle'), (id: 'ilse', name: 'Ilse Marrow'), (id: 'kit', name: 'Kit Marrow')];

void main() {
  test('a line read into a character', () {
    final c = readOneLine('Mira Vance, 34, a smuggler from Glass River, Kai’s sister', cast: _cast);
    expect(c.name, 'Mira Vance');
    expect(c.age, '34');
    expect(c.occupation, 'smuggler');
    expect(c.origin, 'Glass River');
    expect(c.gender, 'Female', reason: 'a sister');
    expect(c.ties.single, (
      otherId: 'kai',
      otherName: 'Kai Doyle',
      preset: 'siblings',
      newIsFrom: false,
      said: 'Kai’s sister',
    ));
    expect(c.summary, '');
  });

  test('who is which in a tie with a direction; a name shared is not guessed', () {
    final a = readOneLine('Tam, Ilse’s apprentice', cast: _cast);
    expect((a.ties.single.preset, a.ties.single.newIsFrom), ('mentor-student', true), reason: 'Ilse the mentor');
    final b = readOneLine('Orla, Kit’s mother', cast: _cast);
    expect((b.ties.single.preset, b.ties.single.newIsFrom), ('parent-child', false));
    expect(readOneLine('Ned, Marrow’s cousin', cast: _cast).ties, isEmpty, reason: 'two Marrows');
    expect(readOneLine('Ned, Bram’s cousin', cast: _cast).ties, isEmpty, reason: 'no Bram in the cast');
  });

  test('the rest: species, role, epithet, age in words; anything else for the summary', () {
    final c = readOneLine('Sefa Quill the Factor, an elf, aged 120, the villain, hates the sea');
    expect(c.name, 'Sefa Quill');
    expect(c.epithet, 'the Factor');
    expect(c.species, 'Elf');
    expect(c.age, '120');
    expect(c.role, 'Antagonist');
    expect(c.occupation, '', reason: '“an elf” and “the villain” say who, not what they do');
    expect(c.summary, 'hates the sea');
    final d = readOneLine('Bram, called the Ox, an old man, from Vell');
    expect((d.epithet, d.gender, d.origin, d.occupation), ('the Ox', 'Male', 'Vell', ''));
  });

  test('a name alone is a name', () {
    final c = readOneLine('James');
    expect((c.name, c.age, c.occupation, c.summary), ('James', '', '', ''));
    expect(c.ties, isEmpty);
  });
}
