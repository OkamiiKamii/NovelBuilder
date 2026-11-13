import 'package:flutter/material.dart';
import 'package:super_editor/super_editor.dart';

import '../../core/layout/breakpoints.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/domain/characters/glance.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/relation.dart';
import '../characters/widgets/vault.dart';
import 'in_chapter.dart';
import 'name_keys.dart';
import 'notify_after_build.dart';

/// AT A GLANCE at the page (`shared/domain/characters/glance.dart` says what is on the card): the caret on a name, the
/// card of whoever or whatever it names, in a strip where the name keys ride (over a phone's keyboard; at the foot of
/// the page on a computer), a press away from the whole card and from their page. While a name is being typed, the
/// keys that complete it have the place instead.
///
/// Reads only; it follows the caret.
class Glance extends ChangeNotifier with NotifyAfterBuild {
  MutableDocumentComposer? _composer;
  MutableDocument? _document;
  InChapter? _company;
  NameKeys? _keys;
  List<CharacterRelation> _relations = const [];
  final _cards = <String, GlanceCard>{};

  GlanceCard? _card;

  /// The card for the name the caret is on, if it is on one.
  GlanceCard? get card => _card;

  /// The entry the card is of.
  Entry? get entry => _card == null ? null : _company?.company?.entries[_card!.id];

  /// What the page knows of everyone (their profiles and kinds), for the faces.
  InChapter? get company => _company;

  void attach({
    required MutableDocumentComposer composer,
    required MutableDocument document,
    required InChapter company,
    required NameKeys keys,
    required NovelStore store,
    required String novelId,
  }) {
    detach();
    _composer = composer..selectionNotifier.addListener(_read);
    _document = document;
    _company = company..addListener(_read);
    _keys = keys..addListener(_read);
    _relations = [for (final r in store.rowsIn(novelId, 'characterRelations')) CharacterRelation(r)];
    _read();
  }

  void detach() {
    _composer?.selectionNotifier.removeListener(_read);
    _company?.removeListener(_read);
    _keys?.removeListener(_read);
    _composer = null;
    _document = null;
    _company = null;
    _keys = null;
    _cards.clear();
    _card = null;
  }

  void _read() {
    GlanceCard? card;
    final selection = _composer?.selection;
    final company = _company?.company;
    if (selection != null && selection.isCollapsed && company != null && !(_keys?.completing ?? false)) {
      final at = selection.extent.nodePosition;
      final node = _document?.getNodeById(selection.extent.nodeId);
      if (at is TextNodePosition && node is TextNode) {
        final found = nameAt(node.text.toPlainText(), at.offset, company.names);
        final entry = found == null ? null : company.entries[found.id];
        if (entry != null) {
          card = _cards.putIfAbsent(
            entry.id,
            () => glanceOf(
              entry,
              profile: company.profiles[entry.id],
              what: company.kinds[entry.category]?.singular ?? '',
              relations: _relations,
              names: {for (final e in company.entries.values) e.id: e.name.trim()},
            ),
          );
        }
      }
    }
    if (card?.id == _card?.id) return;
    _card = card;
    notifyWhenSafe();
  }

  @override
  void dispose() {
    stopNotifying();
    detach();
    super.dispose();
  }
}

/// Where the keys ride: the card of the name the caret is on, or else the name keys.
class GlanceOrKeys extends StatelessWidget {
  const GlanceOrKeys({super.key, required this.glance, required this.keys, required this.onOpen, this.tabHint = false});

  final Glance glance;
  final NameKeys keys;

  /// Opens the entry's own page (the editor saves first).
  final void Function(Entry entry) onOpen;

  /// On a computer: the keys only while a name is typed, the first marked Tab.
  final bool tabHint;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: glance,
      builder: (context, _) {
        final card = glance.card;
        final entry = glance.entry;
        if (card == null || entry == null) return NameKeysRow(keys: keys, tabHint: tabHint);
        return GlanceStrip(card: card, entry: entry, glance: glance, onOpen: () => onOpen(entry), floating: tabHint);
      },
    );
  }
}

/// The card in a line: the face, the name and what they are, and the first facts; a press opens the whole card.
class GlanceStrip extends StatelessWidget {
  const GlanceStrip({
    super.key,
    required this.card,
    required this.entry,
    required this.glance,
    required this.onOpen,
    this.floating = false,
  });

  final GlanceCard card;
  final Entry entry;
  final Glance glance;
  final VoidCallback onOpen;

  /// Over the page (a computer): drawn as a card of its own.
  final bool floating;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final company = glance.company?.company;
    final face = entryFace(
      context,
      entry: entry,
      profile: company?.profiles[entry.id],
      kind: company?.kinds[entry.category],
      size: 36,
    );
    final line = [
      if (card.what.isNotEmpty) card.what,
      for (final f in card.facts.take(3)) '${f.label} ${f.value}',
      ...card.ties.take(1),
    ].join(' · ');
    final strip = Semantics(
      container: true,
      button: true,
      label: '${card.name}${line.isEmpty ? '' : ', $line'}. Show their card',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => showGlanceCard(context, card: card, face: _face(context, 72), onOpen: onOpen),
        child: SizedBox(
          height: 56,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                face,
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        card.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontWeight: FontWeight.w700, color: scheme.onSurface),
                      ),
                      if (line.isNotEmpty)
                        Text(
                          line,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
                        ),
                    ],
                  ),
                ),
                Icon(Icons.expand_less, color: scheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ),
    );
    if (!floating) return strip;
    return Align(
      alignment: Alignment.bottomLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Material(
          color: scheme.surfaceContainerHigh,
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: scheme.primary.withValues(alpha: 0.35)),
          ),
          clipBehavior: Clip.antiAlias,
          child: strip,
        ),
      ),
    );
  }

  Widget _face(BuildContext context, double size) {
    final company = glance.company?.company;
    return entryFace(
      context,
      entry: entry,
      profile: company?.profiles[entry.id],
      kind: company?.kinds[entry.category],
      size: size,
    );
  }
}

/// The whole card: a sheet over a phone's page, a window over a computer's.
Future<void> showGlanceCard(
  BuildContext context, {
  required GlanceCard card,
  required Widget face,
  required VoidCallback onOpen,
}) {
  final body = _GlanceCardBody(card: card, face: face, onOpen: onOpen);
  if (WindowSize.of(context) == WindowSize.compact) {
    return showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SafeArea(child: SingleChildScrollView(child: body)),
    );
  }
  return showDialog<void>(
    context: context,
    builder: (_) => Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: SingleChildScrollView(child: body),
      ),
    ),
  );
}

class _GlanceCardBody extends StatelessWidget {
  const _GlanceCardBody({required this.card, required this.face, required this.onOpen});

  final GlanceCard card;
  final Widget face;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = vaultText(context, size: 15, color: scheme.onSurfaceVariant);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              face,
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(card.name, style: vaultHeading(context, size: 22, color: scheme.onSurface)),
                    ),
                    if (card.what.isNotEmpty)
                      Text(card.what.toUpperCase(), style: vaultHeading(context, size: 12, color: scheme.primary)),
                    if (card.epithet.isNotEmpty) Text('“${card.epithet}”', style: muted),
                  ],
                ),
              ),
            ],
          ),
          if (card.summary.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(card.summary, style: vaultText(context, size: 16)),
          ],
          if (card.facts.isNotEmpty) ...[
            const SizedBox(height: 14),
            for (final f in card.facts)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 120, child: Text(f.label, style: muted)),
                    Expanded(child: Text(f.value, style: vaultText(context, size: 16))),
                  ],
                ),
              ),
          ],
          if (card.ties.isNotEmpty) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final t in card.ties)
                  Chip(avatar: const Icon(Icons.link, size: 16), label: Text(t), visualDensity: VisualDensity.compact),
              ],
            ),
          ],
          if (card.summary.isEmpty && card.facts.isEmpty && card.ties.isEmpty) ...[
            const SizedBox(height: 14),
            Text('Nothing recorded yet beyond the name.', style: muted),
          ],
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.tonalIcon(
              onPressed: () {
                Navigator.of(context).pop();
                onOpen();
              },
              icon: const Icon(Icons.open_in_new),
              label: const Text('Open their page'),
            ),
          ),
        ],
      ),
    );
  }
}
