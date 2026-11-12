import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/consequences/consequences_job.dart';
import 'package:novel_builder/shared/data/background.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/domain/consequences/consequences.dart';

import '../../shared/domain/fixtures.dart';

const _novel = '70465ae9-f720-4346-8683-298ce006ed1a';
const _war = '9b149a4b-9c56-44d6-bb6c-a0e18aa36220-c3';

void main() {
  test('the analysis in its own isolate, from the records as stored, is the analysis of the novel as read', () async {
    final db = AppDatabase.inMemory();
    addTearDown(db.close);
    final store = NovelStore(db)..putNovel(loadFixture('made-in-the-app'));
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final read = store.loadPart(_novel, consequenceCollections)!;
    final here = analyze(worldFromRows(read.rows), const NodeSubject(_war));
    final job = consequencesJob(
      stored: {for (final c in consequenceCollections) c: store.rawJsonIn(_novel, c)},
      subject: const NodeSubject(_war),
      include: const [],
      exclude: const [],
    );
    final aside = await container.read(runAsideProvider)(job);
    expect(aside.title, here.title);
    expect(aside.summaryLine, here.summaryLine);
    expect([for (final c in aside.established) c.message], [for (final c in here.established) c.message]);
    expect([for (final c in aside.potential) c.message], [for (final c in here.potential) c.message]);
  });
}
