import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/systems/pages_names.dart';

void main() {
  List<PageName> read(List<List<String>> chapters, {Set<String> known = const {}, Set<String> aside = const {}}) =>
      namesInPages([for (final (i, p) in chapters.indexed) (id: 'c$i', paragraphs: p)], known: known, setAside: aside);

  test('the system’s messages: the kind from its word, the rank in brackets after', () {
    final names = read([
      ['[Skill acquired: Tide Sense (E)]', 'Title earned: Giant Slayer.'],
      ['【Class unlocked: Warden】', '<Item obtained: Tide Glass>', 'New skill: Spark, and then nothing.'],
    ]);
    expect(
      [for (final n in names) (n.name, n.thing, n.rank)],
      [
        ('Tide Sense', PageThing.skill, 'E'),
        ('Giant Slayer', PageThing.title, ''),
        ('Warden', PageThing.kit, ''),
        ('Tide Glass', PageThing.item, ''),
        ('Spark', PageThing.skill, ''),
      ],
    );
    expect(names.first.chapter, 1);
    expect(names.first.said, '[Skill acquired: Tide Sense (E)]');
  });

  test('a name in brackets alone, counted; the most named first; a message says what it is', () {
    final names = read([
      ['He used [Power Strike] again.', '[Power Strike] missed.'],
      ['[Title earned: Ironside]', 'They called him [Ironside].', '[Power Strike] hit.'],
    ]);
    expect(
      [for (final n in names) (n.name, n.times, n.thing)],
      [('Power Strike', 3, PageThing.skill), ('Ironside', 2, PageThing.title)],
    );
  });

  test('not the system’s own words, not a cry, not a long line; not what the system holds or was set aside', () {
    final names = read(
      [
        [
          '[Status]',
          '[Level up!]',
          '[Warning]',
          '[This is a whole sentence in brackets here]',
          '[Fireball]',
          '[Spark]',
        ],
      ],
      known: {'fireball'},
      aside: {'Spark'},
    );
    expect(names, isEmpty);
  });
}
