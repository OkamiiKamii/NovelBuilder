import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/entrances.dart';
import 'package:novel_builder/shared/domain/characters/feeling_arcs.dart';
import 'package:novel_builder/shared/domain/characters/pov.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import '../helpers/large_novel.dart';

/// Reading a large novel for its cast: three hundred thousand words and four hundred characters, each found by their
/// full name and their first. Each reading once took seconds (a search per name per character over the whole book:
/// Eyes 5.3 s, Arcs 2.9 s, Entrances 2.2 s on a desktop); with the names found in one reading of the text
/// (`cast_names.dart`) each is a fraction of a second. The budget is generous, for slower machines; going back to a
/// search per name would break it many times over.
void main() {
  test(
    'Eyes, Entrances and Arcs read a large novel’s cast in well under the time they once took',
    () {
      final s = largeNovel();
      final people = [
        for (final e in s.rows('loreEntries'))
          if (e['category'] == 'character')
            (id: '${e['id']}', names: ['${e['name']}', '${e['name']}'.split(' ').first]),
      ];
      final docs = {for (final r in s.rows('chapterContents')) '${r['id']}': r['doc']};
      final blocks = [for (final MapEntry(:key, :value) in docs.entries) (id: key, blocks: docBlocks(value))];

      final watch = Stopwatch()..start();
      final eyes = chapterEyes([
        for (final c in blocks)
          (
            id: c.id,
            title: '',
            paragraphs: [
              for (final b in c.blocks)
                if (!b.heading) b.text,
            ],
          ),
      ], people);
      final entrances = entrancesIn(blocks, people);
      final arcs = feelingArcs(blocks, people);
      final took = watch.elapsedMilliseconds;

      expect(eyes, hasLength(blocks.length));
      expect(entrances.order, isNotEmpty, reason: 'the cast is found');
      expect(arcs.chapters, blocks.length);
      expect(took, lessThan(4000), reason: 'all three together took $took ms; they once took over 10,000');
    },
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
