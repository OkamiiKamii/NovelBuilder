import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/systems/number_ledger.dart';

void main() {
  Ledger read(List<List<String>> chapters, {Map<String, num> sheet = const {}}) => numberLedger(
    [for (final (i, p) in chapters.indexed) (id: 'c$i', paragraphs: p)],
    stats: const ['Strength', 'HP'],
    tracks: const ['Level'],
    sheet: sheet,
  );

  test('the numbers each named thing is given, in the book’s order, plain and as a rise', () {
    final l = read([
      ['Kael checked his status. Strength 10. Level 1.'],
      ['[Strength +2 (10 → 12)]', 'He had reached Level 2 at last.'],
      ['HP: 100 / 230'],
    ]);
    final strength = l.lines.firstWhere((x) => x.name == 'Strength');
    expect([for (final e in strength.entries) (e.chapter, e.value, e.from)], [(1, 10, null), (2, 12, 10)]);
    expect([for (final e in l.lines.firstWhere((x) => x.name == 'Level').entries) e.value], [1, 2]);
    expect(l.lines.firstWhere((x) => x.name == 'HP').entries.single.value, 100);
    expect(l.slips, isEmpty);
    expect(strength.entries.first.said, 'Strength 10.');
  });

  test('a sum that does not come out; a rise from the wrong number; a level backwards', () {
    final l = read([
      ['Strength 13. Level 4.'],
      ['[Strength +2 (12 → 15)]'],
      ['By then he was Level 3.'],
    ]);
    expect([for (final s in l.slips) s.kind], [SlipKind.sum, SlipKind.backwards]);
    expect(l.slips.first.says, 'Strength 12 + 2 is 14, not 15 (chapter 2).');
    expect(l.slips.last.says, 'Level 3 in chapter 3, after Level 4 in chapter 1.');
    final start = read([
      ['Strength 13.'],
      ['[Strength +1 (12 → 13)]'],
    ]).slips.single;
    expect(start.kind, SlipKind.start);
    expect(start.says, 'Strength rises from 12 in chapter 2, but it was 13 in chapter 1.');
  });

  test('the pages’ last number against the sheet; stats may fall, levels may not', () {
    final l = read(
      [
        ['HP 200. Level 5.'],
        ['HP 40.'],
      ],
      sheet: {'level': 6, 'HP': 40},
    );
    expect([for (final s in l.slips) (s.kind, s.name)], [(SlipKind.sheet, 'Level')]);
    expect(l.slips.single.says, 'The pages end on Level 5 (chapter 1); the sheet holds 6.');
  });

  test('a name inside another word, or a percentage, is not a number given', () {
    final l = read([
      ['Superstrength 40. Strength 50% of his best. Levelled 3 times.'],
    ]);
    expect(l.lines, isEmpty);
  });

  test('within one chapter: "earlier in the chapter"; the sentence whole, through "->" and "3.5"', () {
    final l = read([
      ['Strength 13. Level 2. Then Strength +2 (12 -> 14). Level 1.'],
    ]);
    expect(
      [for (final s in l.slips) s.says],
      [
        'Strength rises from 12 in chapter 1, but it was 13 earlier in the chapter.',
        'Level 1 in chapter 1, after Level 2 earlier in the chapter.',
      ],
    );
    expect(l.slips.first.at.said, 'Then Strength +2 (12 -> 14).');
    final decimal = read([
      ['By dusk her HP 3.5 and falling. Later.'],
    ]);
    expect(decimal.lines.single.entries.single.said, 'By dusk her HP 3.5 and falling.');
  });
}
