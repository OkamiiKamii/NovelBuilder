import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/data/backup_files.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/model/story_model.dart';
import '../../../shared/domain/records/system.dart';
import '../../../shared/domain/systems/compute.dart';
import '../../characters/widgets/vault.dart';
import 'status_window.dart';
import 'system_speaks.dart' show windowKindOf;

/// THE WINDOW, on Systems: the system's status window as the story would show it, live, in the kind's own dress (a
/// game's blue screen, a jade cultivation record, an arcane ledger, a threat dossier). It shows a sheet as it stands
/// (its values, its level from the experience logged, what it holds), chosen in a row of names; with no sheet yet, a
/// hero holding the system's first things, as it would begin. It is worked out from the blueprint as it is drawn, so
/// a stat renamed, a starting value or a formula changed in the tabs below is in the window at once. **Share the
/// window** makes a picture of it, the way these books' authors show their systems. It only reads.
class LiveWindow extends ConsumerStatefulWidget {
  const LiveWindow({super.key, required this.model, required this.system});

  final StoryModel model;
  final SystemBlueprint system;

  @override
  ConsumerState<LiveWindow> createState() => _LiveWindowState();
}

class _LiveWindowState extends ConsumerState<LiveWindow> {
  String? _sheetId;
  final _capture = GlobalKey();
  bool _working = false;
  String? _message;

  Future<void> _share() async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final boundary = _capture.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final said = await ref
          .read(backupFilesProvider)
          .saveFile('status-window.png', png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final system = widget.system;
    final sheets = [
      for (final s in widget.model.sheets)
        if (s.systemId == system.id && widget.model.entries.containsKey(s.entryId)) s,
    ];
    final sheet = sheets.where((s) => s.id == _sheetId).firstOrNull ?? sheets.firstOrNull;
    final holder = sheet == null ? 'Your hero' : widget.model.entries[sheet.entryId]!.name.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(Icons.web_asset, size: 18, color: scheme.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Semantics(
                header: true,
                child: Text(
                  'THE WINDOW',
                  style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          sheet == null
              ? 'How a sheet in it will look as it begins. Change the system below, and it changes here.'
              : 'Their sheet as it stands, as the story shows it. Change the system below, and it changes here.',
          style: vaultText(context, size: 14.5, style: FontStyle.italic, color: scheme.onSurfaceVariant),
        ),
        if (sheets.length > 1) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final s in sheets)
                ChoiceChip(
                  label: Text(widget.model.entries[s.entryId]!.name),
                  selected: s.id == sheet?.id,
                  onSelected: (_) => setState(() => _sheetId = s.id),
                ),
            ],
          ),
        ],
        const SizedBox(height: 10),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: StatusWindow(
              key: ValueKey('window-${sheet?.id}'),
              content: system.raw,
              presetId: windowKindOf(system),
              holder: holder.isEmpty ? 'Unnamed' : holder,
              held: sheet?.itemIds ?? exampleHeld(system.raw),
              profile: sheet == null ? null : SheetProfile.of(sheet),
              caption: '',
              captureKey: _capture,
            ),
          ),
        ),
        if (_message != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(_message!, style: vaultText(context, size: 14, color: scheme.onSurfaceVariant)),
          ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: _working ? null : _share,
            icon: const Icon(Icons.ios_share, size: 18),
            label: const Text('Share the window'),
          ),
        ),
      ],
    );
  }
}
