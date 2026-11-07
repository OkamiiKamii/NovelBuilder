import 'package:flutter/material.dart';
import 'package:super_editor/super_editor.dart';

import '../../../shared/domain/records/entry.dart';
import 'prose_document.dart';

/// The entry linked at the cursor, if the cursor is on (or right after) linked words.
String? linkedEntryAt(Document document, DocumentSelection? selection) {
  if (selection == null) return null;
  final node = document.getNodeById(selection.extent.nodeId);
  final position = selection.extent.nodePosition;
  if (node is! TextNode || position is! TextNodePosition) return null;
  for (final at in [position.offset, position.offset - 1]) {
    if (at < 0 || at >= node.text.length) continue;
    final link = node.text.getAllAttributionsAt(at).whereType<EntityLinkAttribution>().firstOrNull;
    if (link != null) return link.entryId;
  }
  return null;
}

/// Says what the words at the cursor are linked to, and opens the entry from there. Reading only: the
/// text and its link are not changed.
class LinkBar extends StatelessWidget {
  const LinkBar({
    super.key,
    required this.composer,
    required this.document,
    required this.entryOf,
    required this.kindOf,
    required this.onOpen,
  });

  final DocumentComposer composer;
  final Document document;

  /// The linked entry, or null when it was deleted.
  final Entry? Function(String id) entryOf;

  /// An entry's kind in words ("Character", "Location").
  final String Function(Entry entry) kindOf;

  /// Opens the entry where it lives: a character's profile, anything else under World.
  final ValueChanged<Entry> onOpen;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<DocumentSelection?>(
    valueListenable: composer.selectionNotifier,
    builder: (context, selection, _) {
      final id = linkedEntryAt(document, selection);
      if (id == null) return const SizedBox.shrink();
      final theme = Theme.of(context);
      final entry = entryOf(id);
      return Material(
        color: theme.colorScheme.secondaryContainer.withValues(alpha: 0.5),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          child: Row(
            children: [
              Icon(Icons.link, size: 18, color: theme.colorScheme.onSecondaryContainer),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  entry == null
                      ? 'These words are linked to an entry that was deleted. The words stay as written.'
                      : 'Linked to ${entry.name} (${kindOf(entry)})',
                  style: theme.textTheme.bodySmall,
                ),
              ),
              if (entry != null)
                TextButton(
                  onPressed: () => onOpen(entry),
                  child: Text(entry.category == 'character' ? 'Open ${entry.name}’s profile' : 'Open ${entry.name}'),
                ),
            ],
          ),
        ),
      );
    },
  );
}
