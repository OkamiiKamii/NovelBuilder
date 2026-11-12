import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/data/sample_novel_text.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/systems/from_pages.dart';
import 'package:novel_builder/shared/domain/systems/system_changes.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';

void main() {
  sheetTests();
  test('a game system, from its words, holding the novel’s own skills in place of the examples', () {
    final s = systemFromPages(
      [
        'James gained a level. His new skill was Smart Atoms; the skill tree glowed.',
        'Every skill has a cost. His class was Reincarnator, and his level climbed.',
      ],
      ['Empathic Mimicry', 'Smart Atoms', 'smart atoms'],
    )!;
    expect(s.preset.id, 'litrpg');
    expect(s.signs.first, (word: 'skill', times: 3));
    expect(s.powers, ['Empathic Mimicry', 'Smart Atoms'], reason: 'once each');
    expect(s.abilityGroup, 'Skills');
    final groups = {for (final g in maps(s.content['groups'])) str(g['name']): str(g['id'])};
    final skills = [
      for (final i in maps(s.content['items']))
        if (i['groupId'] == groups['Skills']) str(i['name']),
    ];
    expect(skills, ['Empathic Mimicry', 'Smart Atoms'], reason: 'the novel’s own, not the preset’s examples');
    expect(maps(s.content['items']).any((i) => i['groupId'] == groups['Classes']), isTrue, reason: 'other kinds kept');
  });

  test('cultivation from its words; nothing offered where the pages speak of no system', () {
    final s = systemFromPages(['Her qi surged; the sect elder watched her reach the next realm.'], const [])!;
    expect(s.preset.id, 'cultivation');
    expect(s.powers, isEmpty);
    expect(systemFromPages(['The bell rang. The sea went out.'], const []), isNull);
  });

  test('the sample novel, a book with no system, is offered none', () {
    sampleNovel(now: 0);
    expect(systemFromPages([for (final c in sampleChapters) ...sampleParagraphs(c.text)], const []), isNull);
  });
}

void sheetTests() {
  test('a sheet holds a skill with no class (a group held one at a time, holding none, used to fail)', () {
    var n = 0;
    final c = SystemChanges(sampleNovel(now: 0), now: 0, createId: () => 'id${n++}');
    final system = c.createSystem(systemPresets.firstWhere((p) => p.id == 'litrpg').content);
    final wren = c.snapshot.rows('loreEntries').firstWhere((e) => e['name'] == 'Wren Hollis')['id']! as String;
    final sheet = c.addSheet(system.id, wren);
    final skill = c.systems().single.items.firstWhere((i) => i.name == 'Fireball');
    c.updateSheet(
      sheet.id,
      (_) => {
        'itemIds': [skill.id],
      },
    );
    expect(c.sheets().single.itemIds, [skill.id]);
  });
}
