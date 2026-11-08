import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/progress/widgets/length_shelf.dart';

import 'progress_screens_test.dart' as progress;

void main() {
  test('the length of fiction a word count is, and the words to the next', () {
    expect(lengthOf(0), (index: 0, through: 0.0));
    expect(lengthOf(999).index, 0);
    expect(lengthOf(1000), (index: 1, through: 0.0));
    expect(lengthOf(4250), (index: 1, through: 0.5));
    expect(lengthOf(40000).index, 4, reason: 'a novel from 40,000');
    expect(lengthOf(250000), (index: 5, through: 1.0));

    expect(
      lengthSentence(0),
      'No pages yet, the length of flash fiction. 1,000 more words and it is the length of a short story.',
    );
    expect(lengthSentence(24), startsWith('Less than a manuscript page'));
    expect(lengthSentence(999), endsWith('1 more word and it is the length of a short story.'));
    expect(
      lengthSentence(80000),
      'About 320 manuscript pages, the length of a novel. 20,000 more words and it is the length of a long novel.',
    );
    expect(lengthSentence(120000), endsWith('the length of a long novel. Long enough for any shelf.'));
  });

  testWidgets('Progress shows how long the manuscript is, among the lengths of fiction', (tester) async {
    await progress.setUp(tester);
    expect(find.text('How long it is'), findsOneWidget);
    expect(find.text('Novelette'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'the length of a short story\. .* novelette\.$')), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });
}
