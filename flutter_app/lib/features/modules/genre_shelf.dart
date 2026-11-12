import 'package:flutter/material.dart';

import '../../shared/domain/modules/module_changes.dart';
import '../../shared/domain/modules/module_defs.dart';

import '../characters/widgets/vault.dart';

/// THE GENRE SHELF: on a phone, the genre modules as tiles two by two in place of ten long cards one under another
/// (ten screens of scrolling before "Your modules"). Each tile is the module's sign on a band of its own colour, its
/// name, what kind of story it is for, how many tools it brings, whether it is on here, and the one press it most
/// needs: **Turn on**, or **Open** once it is. A press on the tile opens its full card in its place, across the row,
/// with everything the card had (details, configure, disable); a press on the card's foot closes it again.
class GenreShelf extends StatelessWidget {
  const GenreShelf({
    super.key,
    required this.modules,
    required this.stateOf,
    required this.open,
    required this.writes,
    required this.card,
    required this.onOpen,
    required this.onTurnOn,
    required this.onGo,
  });

  final List<ModuleDefinition> modules;
  final ModuleState Function(ModuleDefinition m) stateOf;

  /// The module whose card is open, if any.
  final String? open;

  /// Whether modules can be turned on here (a review copy cannot).
  final bool writes;
  final Widget Function(ModuleDefinition m) card;
  final ValueChanged<ModuleDefinition> onOpen;
  final ValueChanged<ModuleDefinition> onTurnOn;
  final ValueChanged<ModuleDefinition> onGo;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      const gap = 12.0;
      final width = (box.maxWidth - gap) / 2;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [
          for (final m in modules)
            if (m.id == open)
              SizedBox(
                width: box.maxWidth,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    card(m),
                    TextButton.icon(
                      onPressed: () => onOpen(m),
                      icon: const Icon(Icons.expand_less),
                      label: Text('Back to the shelf', semanticsLabel: 'Close ${m.name}'),
                    ),
                  ],
                ),
              )
            else
              SizedBox(
                width: width,
                child: _Tile(
                  module: m,
                  state: stateOf(m),
                  writes: writes,
                  onOpen: () => onOpen(m),
                  onTurnOn: () => onTurnOn(m),
                  onGo: () => onGo(m),
                ),
              ),
        ],
      );
    },
  );
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.module,
    required this.state,
    required this.writes,
    required this.onOpen,
    required this.onTurnOn,
    required this.onGo,
  });

  final ModuleDefinition module;
  final ModuleState state;
  final bool writes;
  final VoidCallback onOpen;
  final VoidCallback onTurnOn;
  final VoidCallback onGo;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final m = module;
    final tone = moduleTone(m);
    final ink = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark
        ? const Color(0xFFFFF8EC)
        : const Color(0xFF1B140E);
    final on = state == ModuleState.enabled || state == ModuleState.attention;
    final tools = m.tools.length;
    return Material(
      color: scheme.surfaceContainerLow,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: on ? scheme.primary : scheme.outlineVariant.withValues(alpha: 0.7), width: on ? 2 : 1),
      ),
      child: InkWell(
        onTap: onOpen,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Its sign on its own colour, like a book's spine label; its state in the corner.
            Container(
              height: 64,
              color: tone,
              alignment: Alignment.center,
              child: Stack(
                children: [
                  Center(
                    child: ExcludeSemantics(
                      child: Text(
                        m.icon.isEmpty ? m.name.characters.first : m.icon,
                        style: TextStyle(fontSize: 30, color: ink, height: 1),
                      ),
                    ),
                  ),
                  if (on)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Icon(
                        state == ModuleState.attention ? Icons.warning_amber : Icons.check_circle,
                        size: 18,
                        color: ink,
                        semanticLabel: state.label,
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    m.name,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: vaultHeading(context, size: 13, weight: 700, color: scheme.onSurface),
                  ),
                  if (m.genre.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      m.genre,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: vaultText(context, size: 14, style: FontStyle.italic, color: scheme.onSurfaceVariant),
                    ),
                  ],
                  const SizedBox(height: 4),
                  Text(
                    [
                      if (tools > 0) '$tools ${tools == 1 ? 'tool' : 'tools'}',
                      on ? 'On here' : (state == ModuleState.disabled ? 'Switched off' : 'Not on'),
                    ].join(' · '),
                    style: vaultText(context, size: 13.5, color: on ? scheme.primary : scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: on
                  ? FilledButton(
                      onPressed: onGo,
                      child: Text('Open', semanticsLabel: 'Open ${m.name}'),
                    )
                  : writes
                  ? OutlinedButton(
                      onPressed: onTurnOn,
                      child: Text(
                        state == ModuleState.disabled ? 'Turn on again' : 'Turn on',
                        semanticsLabel: 'Turn on ${m.name}',
                      ),
                    )
                  : TextButton(
                      onPressed: onOpen,
                      child: Text('More', semanticsLabel: 'More about ${m.name}'),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Each built-in module's own colour, in their order (ten, none the same); a module of the author's own, by its id.
Color moduleTone(ModuleDefinition m) {
  const tones = [
    0xFF2B7A8C,
    0xFFB4532A,
    0xFF3D5FA8,
    0xFF5C6370,
    0xFFA8436B,
    0xFF3F7D4E,
    0xFF7A4FA3,
    0xFF8A6D1F,
    0xFF4F7A6A,
    0xFF9A5B2E,
  ];
  final at = builtinModules.indexWhere((b) => b.id == m.id);
  if (at >= 0) return Color(tones[at % tones.length]);
  var h = 0;
  for (final c in m.id.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return Color(tones[h % tones.length]);
}
