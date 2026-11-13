import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:super_editor/super_editor.dart';

import '../../app/theme/novel_art.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/named_in.dart';
import '../../shared/domain/codex/in_chapter.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../characters/character_actions.dart' show entryPath;
import '../characters/widgets/cameo.dart';
import '../characters/widgets/cast_card.dart' show castTone;
import '../characters/widgets/portrait.dart';
import '../characters/widgets/vault.dart';
import 'editor/prose_document.dart';

/// The entries a page could name: everyone and everything in the codex, with their profiles, and their kinds.
typedef PageCompany = ({
  Map<String, Entry> entries,
  Map<String, CharacterProfile> profiles,
  Map<String, List<String>> names,
  Map<String, Category> kinds,
});

PageCompany pageCompanyOf(NovelStore store, String novelId) {
  final entries = [for (final r in store.rowsIn(novelId, 'loreEntries')) Entry(r)]
    ..sort((a, b) => a.id.compareTo(b.id));
  final profiles = <String, CharacterProfile>{
    for (final r in [
      ...store.rowsIn(novelId, 'characterProfiles'),
    ]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
      str(r['entryId']): CharacterProfile(r),
  };
  final kinds = resolveCategories([for (final r in store.rowsIn(novelId, 'loreSchemas')) Category(r)]);
  return (
    entries: {for (final e in entries) e.id: e},
    profiles: profiles,
    names: namesToFind(entries, profiles),
    kinds: {for (final k in kinds) k.key: k},
  );
}

/// Who and what the page names, read again a moment after typing stops. Reads only.
class InChapter extends ChangeNotifier {
  MutableDocument? _document;
  PageCompany? _company;
  Timer? _again;
  List<Present> _present = const [];

  List<Present> get present => _present;
  PageCompany? get company => _company;

  void attach(MutableDocument document, PageCompany company) {
    detach();
    _company = company;
    _document = document..addListener(_changed);
    _read();
  }

  void detach() {
    _again?.cancel();
    _document?.removeListener(_changed);
    _document = null;
  }

  void _changed(DocumentChangeLog _) {
    _again?.cancel();
    _again = Timer(const Duration(milliseconds: 900), _read);
  }

  void _read() {
    final document = _document;
    final company = _company;
    if (document == null || company == null) return;
    final texts = <String>[];
    final links = <String, int>{};
    for (final node in document) {
      if (node is! TextNode) continue;
      texts.add(node.text.toPlainText());
      for (final span in node.text.getAttributionSpansByFilter((a) => a is EntityLinkAttribution)) {
        final id = (span.attribution as EntityLinkAttribution).entryId;
        if (company.entries.containsKey(id)) links[id] = (links[id] ?? 0) + 1;
      }
    }
    final next = presentIn(texts, company.names, links: links);
    if (!_same(next, _present)) {
      _present = next;
      notifyListeners();
    }
  }

  static bool _same(List<Present> a, List<Present> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  @override
  void dispose() {
    detach();
    super.dispose();
  }
}

IconData kindIconOf(String key) => switch (key) {
  'character' => Icons.person_outline,
  'location' => Icons.place_outlined,
  'faction' => Icons.groups_outlined,
  'item' => Icons.diamond_outlined,
  'power' => Icons.bolt_outlined,
  _ => Icons.auto_stories_outlined,
};

Color _hex(String hex, Color fallback) {
  try {
    return Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);
  } on Object {
    return fallback;
  }
}

/// IN THIS CHAPTER, under the chapter's heading: the company the page keeps, as a printed play lists its players. Each
/// character the chapter names (by their portrait, or their cameo), then the places, factions and things, most
/// mentioned first with how often; a press opens their page (the editor saves first). Only what the text itself
/// names or links: nothing is guessed, and nothing is written.
class InChapterStrip extends StatelessWidget {
  const InChapterStrip({super.key, required this.watch, required this.onLeave, this.ink, this.muted});

  final InChapter watch;

  /// Before going to an entry's page.
  final VoidCallback onLeave;
  final Color? ink;
  final Color? muted;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: watch,
    builder: (context, _) {
      final company = watch.company;
      final present = watch.present;
      if (company == null || present.isEmpty) return const SizedBox.shrink();
      final scheme = Theme.of(context).colorScheme;
      final soft = muted ?? scheme.onSurfaceVariant;
      // Characters first, then the rest; each group most mentioned first.
      final people = [
        for (final p in present)
          if (company.entries[p.id]?.category == 'character') p,
      ];
      final things = [
        for (final p in present)
          if (company.entries[p.id]?.category != 'character') p,
      ];
      return Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'IN THIS CHAPTER',
              textAlign: TextAlign.center,
              style: vaultHeading(context, size: 10.5, color: soft, weight: 700),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 112,
              child: Center(
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  shrinkWrap: true,
                  children: [
                    for (final p in [...people, ...things])
                      _Player(
                        entry: company.entries[p.id]!,
                        profile: company.profiles[p.id],
                        kind: company.kinds[company.entries[p.id]!.category],
                        mentions: p.mentions,
                        ink: ink ?? scheme.onSurface,
                        muted: soft,
                        onOpen: () {
                          onLeave();
                          final e = company.entries[p.id]!;
                          context.go(entryPath(e.id, character: e.category == 'character'));
                        },
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    },
  );
}

/// An entry's own colour: a character's cast tone, otherwise its kind's colour.
Color entryTone(BuildContext context, Entry entry, Category? kind) =>
    entry.category == 'character' ? castTone(entry.id) : _hex(kind?.color ?? '', Theme.of(context).colorScheme.primary);

/// An entry's face in a round of [size]: a character's picture, else their cameo; anything else, its kind's icon in its
/// colour.
Widget entryFace(
  BuildContext context, {
  required Entry entry,
  CharacterProfile? profile,
  Category? kind,
  double size = 50,
}) {
  final character = entry.category == 'character';
  final name = entry.name.trim().isEmpty ? 'Unnamed' : entry.name.trim();
  final tone = entryTone(context, entry, kind);
  final bytes = character ? uploadedImageBytes(entry.image) : null;
  if (bytes != null) {
    return ClipOval(
      child: Portrait(name: name, image: entry.image, focal: profile?.focal, size: size),
    );
  }
  if (character) {
    final look = NovelArt.of(context).bound(tone, lift: 0.1, sink: 0.45, tinted: true);
    // Round, as every face in the line is: the cameo's ground would otherwise fill a square.
    return ClipOval(
      child: SizedBox.square(
        dimension: size,
        child: Cameo(
          look: cameoLookOf(entry, profile),
          ground: look.ground,
          ink: look.ink,
          frame: tone.withValues(alpha: 0.8),
        ),
      ),
    );
  }
  return Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: tone.withValues(alpha: 0.18),
      border: Border.all(color: tone.withValues(alpha: 0.8), width: 1.5),
    ),
    child: Icon(kindIconOf(entry.category), color: tone, size: size * 0.48),
  );
}

class _Player extends StatelessWidget {
  const _Player({
    required this.entry,
    required this.profile,
    required this.kind,
    required this.mentions,
    required this.ink,
    required this.muted,
    required this.onOpen,
  });

  final Entry entry;
  final CharacterProfile? profile;
  final Category? kind;
  final int mentions;
  final Color ink;
  final Color muted;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final character = entry.category == 'character';
    final name = entry.name.trim().isEmpty ? 'Unnamed' : entry.name.trim();
    final tone = entryTone(context, entry, kind);
    final face = entryFace(context, entry: entry, profile: profile, kind: kind, size: 50);
    final what = kind?.singular ?? (character ? 'Character' : 'Entry');
    return Semantics(
      button: true,
      label: '$name, ${what.toLowerCase()}, named ${mentions == 1 ? 'once' : '$mentions times'} in this chapter',
      excludeSemantics: true,
      child: Tooltip(
        message: '$what · open their page',
        child: InkWell(
          onTap: onOpen,
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 76,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Column(
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      face,
                      Positioned(
                        right: -6,
                        bottom: -2,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.surface,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: tone.withValues(alpha: 0.8)),
                          ),
                          child: Text(
                            '×$mentions',
                            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: ink),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: vaultText(context, size: 13, color: ink).copyWith(height: 1.1),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
