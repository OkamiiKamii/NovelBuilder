import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../shared/domain/visualize/views.dart';
import '../characters/widgets/vault.dart';
import '../workspace/area_switch.dart' show AreaPart;

/// The subjects the views are gathered under, in order, and which view goes under which. A view not named here (a
/// later one) goes under the last.
const atlasSubjects = <(String, List<String>)>[
  ('People', ['relationships', 'history', 'appearances', 'progression', 'abilities', 'knowledge']),
  ('Time', ['timeline', 'order']),
  ('The story', ['plot', 'structure']),
  ('The world', ['places', 'journeys', 'factions', 'ownership', 'kinds', 'graph']),
  ('Numbers', ['charts']),
];

String _keyOf(AreaPart p) => p.path == '/visualize' ? 'relationships' : p.path.split('/').last;

/// The views offered, gathered by subject in the atlas's order (empty subjects left out).
List<(String, List<AreaPart>)> atlasOf(List<AreaPart> parts) {
  final placed = <String>{};
  final out = <(String, List<AreaPart>)>[];
  for (final (subject, keys) in atlasSubjects) {
    final here = [for (final k in keys) ?parts.where((p) => _keyOf(p) == k).firstOrNull];
    placed.addAll(here.map(_keyOf));
    if (here.isNotEmpty) out.add((subject, here));
  }
  final rest = [
    for (final p in parts)
      if (!placed.contains(_keyOf(p))) p,
  ];
  if (rest.isNotEmpty) {
    if (out.isNotEmpty && out.last.$1 == atlasSubjects.last.$1) {
      out.last.$2.addAll(rest);
    } else {
      out.add((atlasSubjects.last.$1, rest));
    }
  }
  return out;
}

/// THE ATLAS OF VIEWS: every view the novel offers as a plate in a book of plates, gathered by subject (People, Time,
/// The story, The world, Numbers): its emblem, its name in the vault's capitals and what it shows, in the book face.
/// The one shown now is framed in the accent and says so. A press opens it. On a phone it fills the screen.
Future<void> showViewAtlas(
  BuildContext context, {
  required List<AreaPart> parts,
  String? current,
  required ValueChanged<String> onGo,
}) {
  final compact = WindowSize.of(context) == WindowSize.compact;
  final body = _Atlas(parts: parts, current: current, onGo: onGo);
  return showDialog<void>(
    context: context,
    builder: (context) => compact
        ? Dialog.fullscreen(child: body)
        : Dialog(
            insetPadding: const EdgeInsets.all(32),
            child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 980, maxHeight: 820), child: body),
          ),
  );
}

class _Atlas extends StatelessWidget {
  const _Atlas({required this.parts, required this.current, required this.onGo});

  final List<AreaPart> parts;
  final String? current;
  final ValueChanged<String> onGo;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final described = {for (final v in visualViews) v.path: v.description};
    return Semantics(
      label: 'All views',
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 8, 4),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                        header: true,
                        child: Text('The views', style: vaultHeading(context, size: 22, weight: 700)),
                      ),
                      Text(
                        'Your records, drawn ${parts.length} ways. Choose one to open it.',
                        style: vaultText(context, size: 16, color: scheme.onSurfaceVariant, style: FontStyle.italic),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Close the views',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          const Divider(),
          Expanded(
            child: LayoutBuilder(
              builder: (context, box) {
                final columns = (box.maxWidth / 300).floor().clamp(1, 3);
                final width = (box.maxWidth - 48 - 12 * (columns - 1)) / columns;
                // Every plate is built at once (a few dozen at most), so each can be found and read.
                return SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final (subject, views) in atlasOf(parts)) ...[
                        Padding(
                          padding: const EdgeInsets.only(top: 12, bottom: 8),
                          child: Semantics(
                            header: true,
                            child: Text(subject, style: vaultHeading(context, size: 13, weight: 700)),
                          ),
                        ),
                        Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            for (final p in views)
                              SizedBox(
                                width: width,
                                child: _Plate(
                                  part: p,
                                  description: described[p.path] ?? '',
                                  current: p.path == current,
                                  onTap: () {
                                    Navigator.of(context).pop();
                                    if (p.path != current) onGo(p.path);
                                  },
                                ),
                              ),
                          ],
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Plate extends StatelessWidget {
  const _Plate({required this.part, required this.description, required this.current, required this.onTap});

  final AreaPart part;
  final String description;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      selected: current,
      label: '${part.label}${current ? ', showing now' : ''}. $description',
      excludeSemantics: true,
      onTap: onTap,
      child: Material(
        color: current ? scheme.primary.withValues(alpha: 0.08) : scheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: current ? scheme.primary : scheme.outlineVariant, width: current ? 2 : 1),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: scheme.primary, width: 1.5),
                    color: current ? scheme.primary : null,
                  ),
                  child: Icon(part.icon, color: current ? scheme.onPrimary : scheme.primary, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(part.label, style: vaultHeading(context, size: 13.5, weight: 700, color: scheme.onSurface)),
                      if (current)
                        Text(
                          'Showing now',
                          style: vaultText(context, size: 14, color: scheme.primary, style: FontStyle.italic),
                        ),
                      const SizedBox(height: 2),
                      Text(
                        description,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
