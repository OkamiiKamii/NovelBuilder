import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/codex/field_values.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/text/fold.dart';

FieldDef _def(
  String type, {
  List<String> options = const [],
  num? min,
  num? max,
  bool required = false,
  String? target,
}) => FieldDef({
  'id': 'd',
  'name': 'Power',
  'type': type,
  'options': options,
  'min': ?min,
  'max': ?max,
  'required': required,
  'target': ?target,
});

void main() {
  final entries = {
    'mira': Entry({'id': 'mira', 'category': 'character', 'name': 'Mira'}),
    'keep': Entry({'id': 'keep', 'category': 'location', 'name': 'The Keep'}),
  };
  String? problem(FieldDef def, String value) =>
      checkValue(def, value, entries, categoryName: (k) => k == 'character' ? 'Characters' : k)?.message;

  test('values are read the way a reader should see them; a deleted link reads as nothing', () {
    String? name(String id) => entries[id]?.name;
    expect(displayValue(FieldType.toggle, 'yes', name), 'Yes');
    expect(displayValue(FieldType.toggle, 'no', name), 'No');
    expect(displayValue(FieldType.toggle, 'maybe', name), 'maybe');
    expect(displayValue(FieldType.tags, 'Fire\n\n Ash \n', name), 'Fire, Ash');
    expect(displayValue(FieldType.reference, 'mira', name), 'Mira');
    expect(displayValue(FieldType.reference, 'gone', name), '');
    expect(displayValue(FieldType.references, 'mira\ngone\nkeep', name), 'Mira, The Keep');
    expect(displayValue(null, '  ', name), '');
    expect(displayValue(FieldType.number, '42', name), '42');
  });

  test('every problem a value can have against its field is said, in the original app’s words', () {
    expect(problem(_def('text', required: true), ' '), 'Power is required.');
    expect(problem(_def('text'), ''), isNull);
    expect(problem(_def('number'), 'many'), 'Power should be a number; it holds “many”.');
    expect(problem(_def('number'), 'Infinity'), 'Power should be a number; it holds “Infinity”.');
    expect(problem(_def('number', min: 1), '0.5'), 'Power should be at least 1; it is 0.5.');
    expect(problem(_def('number', max: 10), '12'), 'Power should be at most 10; it is 12.');
    expect(problem(_def('number', min: 0, max: 255), '0xFF'), isNull);
    expect(problem(_def('number'), ' 1e3 '), isNull);
    expect(problem(_def('date'), '2024-02-30'), 'Power should be a date; it holds “2024-02-30”.');
    expect(problem(_def('date'), '2024-02-29'), isNull);
    expect(problem(_def('toggle'), 'Yes'), 'Power should be yes or no; it holds “Yes”.');
    expect(
      problem(_def('select', options: ['Low', 'High']), 'Mid'),
      'Power should be one of Low, High; it holds “Mid”.',
    );
    expect(problem(_def('select'), 'Anything'), isNull, reason: 'no choices set: anything fits');
    expect(
      problem(_def('multiselect', options: ['Fire', 'Ash']), 'Fire\nSmoke\nDust'),
      'Power holds “Smoke”, “Dust”, not among its choices.',
    );
    expect(problem(_def('reference'), 'gone'), 'Power holds “gone”, which is not an entry.');
    expect(problem(_def('references'), 'gone\nlost'), 'Power holds “gone”, “lost”, which are not an entry.');
    expect(
      problem(_def('references', target: 'character'), 'mira\nkeep'),
      'Power should link to Characters; The Keep is not.',
    );
  });

  test('searching ignores accents and case the way the original app does', () {
    expect(foldText('Émile Ångström'), 'emile angstrom');
    expect(foldText('İstanbul'), 'istanbul');
    expect(foldText('Йорк'), 'иорк', reason: 'Cyrillic short i decomposes too');
    // Letters that are not a base and an accent stay themselves, as with NFD.
    expect(foldText('Øster Łódź'), 'øster łodz');
    expect(foldText('é'), 'e', reason: 'an accent typed separately is dropped');
  });

  test('images are kept only as web addresses or uploaded pictures, within the original’s size', () {
    expect(normalizeImage('https://example.com/a.png'), 'https://example.com/a.png');
    expect(normalizeImage('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
    expect(normalizeImage('javascript:alert(1)'), isNull);
    expect(normalizeImage('data:text/html;base64,AAAA'), isNull);
    expect(normalizeImage(''), isNull);
    expect(normalizeImage('data:image/png;base64,${'A' * 2000000}'), isNull);
  });
}
