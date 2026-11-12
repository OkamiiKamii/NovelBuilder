import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/background.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart' show countMentions, mentionsJob;
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/modules/module_match.dart';

void main() {
  test('the app runs a whole book’s matching in its own isolate and gets the same answer as in place', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final stored = [
      for (var i = 0; i < 40; i++)
        jsonEncode({'id': 'c$i', 'doc': textToDoc('The mage gained a skill and ranks of evolution. ' * 200)}),
    ];
    // The very job the Modules page sends (a closure made in the page would hold the page and the database: unsendable).
    final job = modulesSuggestionJob(
      genres: const ['LitRPG'],
      tags: const [],
      synopsis: '',
      storedContents: stored,
      on: const {},
    );
    final aside = await container.read(runAsideProvider)(job);
    expect('$aside', '${job()}');
    expect(aside.first.moduleId, 'progression');
  });

  test(
    'a character’s name mentions are counted in their own isolate as in place, from the chapters as stored',
    () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      const first = 'Kael drew. “Kael!” The Oathbreaker ran.';
      const second = 'Kaelen did not.';
      const third = 'Then Kael slept.';
      final stored = [
        jsonEncode({'id': 'c1', 'doc': textToDoc('$first\n\n$second')}),
        '{not json',
        jsonEncode({'id': 'c2', 'doc': textToDoc(third)}),
      ];
      const names = ['Kael', 'The Oathbreaker'];
      final job = mentionsJob(stored, names);
      expect(await container.read(runAsideProvider)(job), 4);
      expect(job(), countMentions([first, second, third], names));
    },
  );
}
