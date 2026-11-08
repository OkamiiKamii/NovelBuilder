import 'package:flutter/material.dart';

import '../../../shared/domain/json.dart';
import '../../../shared/domain/systems/system_presets.dart';
import '../../characters/widgets/vault.dart';

/// The motif of each preset, by its id (an unknown one has the system mark).
IconData presetIcon(String id) => switch (id) {
  'litrpg' => Icons.sports_esports_outlined,
  'cultivation' => Icons.self_improvement,
  'hard-magic' => Icons.auto_fix_high,
  'superhero' => Icons.bolt,
  _ => Icons.account_tree_outlined,
};

/// What a blueprint holds, said as lines: "Levels: Level", "Ranks: Common → Advanced → …", "Attributes: Strength,
/// Agility, Intelligence and 9 more", "Classes, skills & more: Classes, Skills, Titles". Only what it has.
List<(String, String)> blueprintLines(JsonMap content) {
  List<String> names(String key) => [for (final m in maps(content[key])) str(m['name'])];
  String some(List<String> all, [int shown = 3]) =>
      all.length <= shown ? all.join(', ') : '${all.take(shown).join(', ')} and ${all.length - shown} more';
  final tracks = names('tracks');
  final ranks = names('ranks');
  final variables = names('variables');
  final groups = names('groups');
  return [
    if (tracks.isNotEmpty) ('Levels & realms', tracks.join(', ')),
    if (ranks.isNotEmpty) ('Ranks', ranks.join(' → ')),
    if (variables.isNotEmpty) ('Attributes & resources', some(variables)),
    if (groups.isNotEmpty) ('Classes, skills & more', groups.join(', ')),
  ];
}

/// THE SYSTEMS GALLERY: an empty Systems page shows every preset as a card to start from, in place of a link to a
/// menu: its motif, name and description, then what it holds (its levels, its ranks in order, some of its attributes,
/// its kinds of class or skill), and **Begin with** it; a last card begins blank. Whatever is begun can be renamed and
/// changed throughout.
class SystemGallery extends StatelessWidget {
  const SystemGallery({super.key, required this.onPreset, required this.onBlank});

  final ValueChanged<SystemPreset> onPreset;
  final VoidCallback onBlank;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Begin a system', style: vaultHeading(context, size: 18, weight: 700)),
        const SizedBox(height: 4),
        Text(
          'For a novel with a worked-out system: a game system, cultivation realms, hard magic. Begin from one of these '
          'or from nothing; every name, number and rank can be changed after.',
          style: vaultText(context, size: 16, color: scheme.onSurfaceVariant, style: FontStyle.italic),
        ),
        const SizedBox(height: 14),
        LayoutBuilder(
          builder: (context, box) {
            final columns = box.maxWidth >= 720 ? 2 : 1;
            final width = (box.maxWidth - 14 * (columns - 1)) / columns;
            return Wrap(
              spacing: 14,
              runSpacing: 14,
              children: [
                for (final p in systemPresets)
                  SizedBox(
                    width: width,
                    child: _Card(
                      icon: presetIcon(p.id),
                      name: p.name,
                      description: p.description,
                      lines: blueprintLines(p.content),
                      action: FilledButton.tonal(
                        onPressed: () => onPreset(p),
                        child: Text('Begin with ${p.name}', textAlign: TextAlign.center),
                      ),
                    ),
                  ),
                SizedBox(
                  width: width,
                  child: _Card(
                    icon: Icons.add,
                    name: 'A blank system',
                    description: 'Nothing in it yet: add the attributes, levels, ranks and skills your story needs.',
                    lines: const [],
                    action: OutlinedButton(onPressed: onBlank, child: const Text('Begin blank')),
                  ),
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.icon,
    required this.name,
    required this.description,
    required this.lines,
    required this.action,
  });

  final IconData icon;
  final String name;
  final String description;
  final List<(String, String)> lines;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return VaultFrame(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: scheme.primary, width: 1.5),
                ),
                child: Icon(icon, color: scheme.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(name, style: vaultHeading(context, size: 15, weight: 700, color: scheme.onSurface)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(description, style: vaultText(context, size: 16)),
          if (lines.isNotEmpty) ...[
            const VaultRule(),
            for (final (label, value) in lines)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '$label  ',
                        style: vaultHeading(context, size: 10.5, weight: 700, color: scheme.primary),
                      ),
                      TextSpan(text: value),
                    ],
                  ),
                  style: vaultText(context, size: 15.5, color: scheme.onSurfaceVariant),
                ),
              ),
          ],
          const SizedBox(height: 10),
          SizedBox(width: double.infinity, child: action),
        ],
      ),
    );
  }
}
