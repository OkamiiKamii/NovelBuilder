import 'package:flutter/material.dart';

import '../../../shared/domain/analytics/progress.dart' show grouped;
import '../../characters/widgets/vault.dart';

/// The lengths fiction is commonly sorted by, by word count, each up to (not including) its end. The usual awards'
/// bounds (flash fiction to 1,000, short story to 7,500, novelette to 17,500, novella to 40,000); "long novel" from
/// 100,000.
const storyLengths = <({String name, int end})>[
  (name: 'Flash fiction', end: 1000),
  (name: 'Short story', end: 7500),
  (name: 'Novelette', end: 17500),
  (name: 'Novella', end: 40000),
  (name: 'Novel', end: 100000),
  (name: 'Long novel', end: 1 << 62),
];

/// Words on a standard manuscript page (12-point, double-spaced), the usual reckoning.
const wordsPerManuscriptPage = 250;

/// Which of [storyLengths] [words] is, and how far through it (0–1; the last is never "through").
({int index, double through}) lengthOf(int words) {
  var start = 0;
  for (final (i, l) in storyLengths.indexed) {
    if (words < l.end) {
      final last = i == storyLengths.length - 1;
      return (index: i, through: last ? 1.0 : ((words - start) / (l.end - start)).clamp(0.0, 1.0));
    }
    start = l.end;
  }
  return (index: storyLengths.length - 1, through: 1);
}

/// What the shelf says: the length now, the pages, and the words to the next length.
String lengthSentence(int words) {
  final at = lengthOf(words);
  final now = storyLengths[at.index];
  final pages = (words / wordsPerManuscriptPage).round();
  final pagesText = words == 0
      ? 'No pages yet'
      : pages < 1
      ? 'Less than a manuscript page'
      : 'About ${grouped(pages)} manuscript ${pages == 1 ? 'page' : 'pages'}';
  final next = at.index + 1 < storyLengths.length ? storyLengths[at.index + 1] : null;
  final toGo = now.end - words;
  final nextText = next == null
      ? 'Long enough for any shelf.'
      : '${grouped(toGo)} more ${toGo == 1 ? 'word' : 'words'} and it is the length of a ${next.name.toLowerCase()}.';
  return '$pagesText, the length of ${_article(now.name)}. $nextText';
}

String _article(String name) => name == 'Flash fiction' ? 'flash fiction' : 'a ${name.toLowerCase()}';

/// THE SHELF OF LENGTHS: the manuscript's length among the lengths of fiction, as six volumes on a shelf growing
/// taller from flash fiction to a long novel. The lengths passed are bound in the accent; the one the manuscript is
/// now fills from the foot as it grows; those ahead stand in outline. Under it, in words: about how many manuscript
/// pages, the length it is, and how many words to the next.
class LengthShelf extends StatelessWidget {
  const LengthShelf({super.key, required this.words});

  final int words;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final at = lengthOf(words);
    final sentence = lengthSentence(words);
    return Semantics(
      container: true,
      label: sentence,
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 132,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < storyLengths.length; i++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          _Spine(
                            height: 46 + i * 13.0,
                            fill: i < at.index ? 1 : (i == at.index ? at.through : 0),
                            current: i == at.index,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          // The shelf they stand on.
          Container(height: 3, color: scheme.outline),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final (i, l) in storyLengths.indexed)
                Expanded(
                  // A word to a line, made smaller only when a word is wider than its volume, never broken.
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      l.name.replaceAll(' ', '\n'),
                      textAlign: TextAlign.center,
                      style: vaultHeading(
                        context,
                        size: 9.5,
                        weight: i == at.index ? 700 : 600,
                        color: i == at.index ? scheme.primary : scheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(sentence, style: vaultText(context, size: 17, style: FontStyle.italic)),
        ],
      ),
    );
  }
}

class _Spine extends StatelessWidget {
  const _Spine({required this.height, required this.fill, required this.current});

  final double height;
  final double fill;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      height: height,
      constraints: const BoxConstraints(maxWidth: 46),
      decoration: BoxDecoration(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
        border: Border.all(color: fill > 0 || current ? scheme.primary : scheme.outlineVariant, width: current ? 2 : 1),
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Align(
              alignment: Alignment.bottomCenter,
              child: FractionallySizedBox(
                heightFactor: fill,
                widthFactor: 1,
                child: ColoredBox(color: scheme.primary.withValues(alpha: current ? 0.75 : 0.9)),
              ),
            ),
            // Two gilt bands, as on a bound spine.
            for (final top in [0.16, 0.24])
              Positioned(
                left: 0,
                right: 0,
                top: height * top,
                child: Container(height: 1.5, color: scheme.onSurfaceVariant.withValues(alpha: 0.35)),
              ),
          ],
        ),
      ),
    );
  }
}
