import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/one_line.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/relationships/relation_types.dart';
import 'widgets/cameo.dart';
import 'widgets/cast_card.dart' show castTone;
import 'widgets/vault.dart';

typedef NewCharacter = ({
  String id,
  String name,
  String epithet,
  List<String> roles,
  String summary,
  String templateId,

  /// What the line said that the profile records as fields: Age, Gender, Species, Occupation, Place of Origin.
  Map<String, String> fields,

  /// Ties the line named to characters already in the cast.
  List<LineTie> ties,
});

/// Asks for a new character. Only a name is needed; the layout can be changed at any time afterwards.
Future<NewCharacter?> showNewCharacterDialog(
  BuildContext context, {
  required List<CharacterTemplate> templates,
  List<({String id, String name})> cast = const [],

  /// What the line begins with, the name still to be written in front of it (", Wren's rival", from an empty chair).
  String? line,
}) => showDialog<NewCharacter>(context: context, builder: (_) => _NewCharacterDialog(templates, cast, line));

/// THE CASTING CALL: a new character starts as their portrait card, as it will hang on the cast wall, and fills in
/// while the author types: the monogram on the colour they will keep (their id is decided now, so it is theirs from
/// the first letter), the name in the vault's capitals, the epithet, the roles and a line about them. "Add to the
/// cast" makes them and opens their profile.
class _NewCharacterDialog extends StatefulWidget {
  const _NewCharacterDialog(this.templates, this.cast, this.line);
  final List<CharacterTemplate> templates;
  final List<({String id, String name})> cast;
  final String? line;

  @override
  State<_NewCharacterDialog> createState() => _NewCharacterDialogState();
}

class _NewCharacterDialogState extends State<_NewCharacterDialog> {
  final _id = newId();
  final _name = TextEditingController();
  final _epithet = TextEditingController();
  final _summary = TextEditingController();
  final _line = TextEditingController();
  final _roles = <String>{};
  late String _template = widget.templates.first.id;
  bool _tried = false;

  /// What the line says, read as it is typed (`one_line.dart`).
  OneLine? _read;

  @override
  void initState() {
    super.initState();
    // Begun from an empty chair: the line says who they are to the lead, and the cursor waits for their name.
    if (widget.line case final line? when line.trim().isNotEmpty) {
      _line.value = TextEditingValue(text: line, selection: const TextSelection.collapsed(offset: 0));
      // Read as if a name stood in front, so what follows is read as what it is (a tie, a role) and not taken for
      // the name; the name is left for the author.
      final read = readOneLine('Someone$line', cast: widget.cast);
      _apply(read);
      _name.clear();
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _epithet.dispose();
    _summary.dispose();
    _line.dispose();
    super.dispose();
  }

  /// The line fills in the name, epithet, role and summary below as it is typed; they can still be changed by hand.
  void _lineChanged(String text) {
    final read = text.trim().isEmpty ? null : readOneLine(text, cast: widget.cast);
    setState(() => _apply(read));
  }

  void _apply(OneLine? read) {
    _read = read;
    if (read == null) return;
    _name.text = read.name;
    if (read.epithet.isNotEmpty) _epithet.text = read.epithet;
    if (read.role.isNotEmpty) _roles.add(read.role);
    if (read.summary.isNotEmpty) _summary.text = read.summary;
  }

  Map<String, String> get _fields {
    final r = _read;
    if (r == null) return const {};
    return {
      if (r.age.isNotEmpty) 'Age': r.age,
      if (r.gender.isNotEmpty) 'Gender': r.gender,
      if (r.species.isNotEmpty) 'Species': r.species,
      if (r.occupation.isNotEmpty) 'Occupation': r.occupation,
      if (r.origin.isNotEmpty) 'Place of Origin': r.origin,
    };
  }

  void _submit() {
    setState(() => _tried = true);
    if (_name.text.trim().isEmpty) return;
    Navigator.of(context).pop((
      id: _id,
      name: _name.text.trim(),
      epithet: _epithet.text.trim(),
      roles: [
        for (final r in characterRoles)
          if (_roles.contains(r)) r,
      ],
      summary: _summary.text.trim(),
      templateId: _template,
      fields: _fields,
      ties: _read?.ties ?? const [],
    ));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final compact = WindowSize.of(context) == WindowSize.compact;
    final template = widget.templates.firstWhere((t) => t.id == _template);
    void changed(String _) => setState(() {});

    final also = [
      for (final MapEntry(:key, :value) in _fields.entries) (key == 'Place of Origin' ? 'From' : key, value),
      for (final t in _read?.ties ?? const <LineTie>[]) (typeFor(t.preset).label, t.otherName),
    ];
    final fields = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // A CHARACTER IN A LINE: who they are, as it would be jotted; what it says fills in the rest.
        TextField(
          controller: _line,
          autofocus: true,
          textInputAction: TextInputAction.next,
          minLines: 1,
          maxLines: 3,
          style: vaultText(context, size: 17),
          decoration: const InputDecoration(
            labelText: 'Write them in a line',
            hintText: 'Mira Vance, 34, a smuggler from Glass River, Kai’s sister',
            helperText: 'Name first, then whatever you know; or fill in the fields below.',
            helperMaxLines: 2,
            prefixIcon: Icon(Icons.edit_note),
          ),
          onChanged: _lineChanged,
        ),
        if (also.isNotEmpty) ...[
          const SizedBox(height: 8),
          Semantics(
            container: true,
            label: 'Also recorded',
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text('Also recorded:', style: theme.textTheme.labelLarge),
                for (final (what, value) in also)
                  Chip(
                    visualDensity: VisualDensity.compact,
                    label: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: '$what  ',
                            style: vaultHeading(context, size: 10.5, weight: 700, color: theme.colorScheme.primary),
                          ),
                          TextSpan(text: value),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        TextField(
          controller: _name,
          textInputAction: TextInputAction.next,
          style: vaultHeading(context, size: 20, weight: 700, color: theme.colorScheme.onSurface),
          decoration: InputDecoration(
            labelText: 'Name *',
            errorText: _tried && _name.text.trim().isEmpty ? 'Give the character a name.' : null,
          ),
          onChanged: changed,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _epithet,
          textInputAction: TextInputAction.next,
          style: vaultText(context, size: 18, style: FontStyle.italic),
          decoration: const InputDecoration(labelText: 'Title or epithet', hintText: 'The Last Heir'),
          onChanged: changed,
        ),
        const SizedBox(height: 12),
        Text('Narrative role (one or several)', style: theme.textTheme.labelLarge),
        const SizedBox(height: 4),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            for (final role in characterRoles)
              FilterChip(
                label: Text(role),
                selected: _roles.contains(role),
                onSelected: (on) => setState(() => on ? _roles.add(role) : _roles.remove(role)),
              ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _summary,
          minLines: 2,
          maxLines: 4,
          style: vaultText(context, size: 17),
          decoration: const InputDecoration(labelText: 'Summary', hintText: 'Who they are, in a line or two'),
          onChanged: changed,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _template,
          isExpanded: true,
          decoration: InputDecoration(labelText: 'Profile layout', helperText: template.description, helperMaxLines: 3),
          items: [
            for (final t in widget.templates)
              DropdownMenuItem(
                value: t.id,
                child: Text(t.name, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (v) => setState(() => _template = v ?? _template),
        ),
      ],
    );
    final card = _PortraitPreview(
      id: _id,
      name: _name.text.trim(),
      epithet: _epithet.text.trim(),
      roles: [
        for (final r in characterRoles)
          if (_roles.contains(r)) r,
      ],
      summary: _summary.text.trim(),
      width: compact ? 150 : 220,
      fields: _fields,
    );

    return AlertDialog(
      title: Text('A new character', style: vaultHeading(context, size: 20, weight: 700)),
      scrollable: true,
      content: SizedBox(
        width: compact ? 480 : 720,
        child: compact
            ? Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(child: card),
                  const SizedBox(height: 16),
                  fields,
                ],
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  card,
                  const SizedBox(width: 28),
                  Expanded(child: fields),
                ],
              ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton.icon(
          onPressed: _submit,
          icon: const Icon(Icons.person_add_alt),
          label: const Text('Add to the cast'),
        ),
      ],
    );
  }
}

/// The character's card as it will hang on the cast wall, drawn from what is typed so far. Decoration: the fields
/// say the same to a screen reader.
class _PortraitPreview extends StatelessWidget {
  const _PortraitPreview({
    required this.id,
    required this.name,
    required this.epithet,
    required this.roles,
    required this.summary,
    required this.width,
    this.fields = const {},
  });

  final String id;
  final String name;
  final String epithet;
  final List<String> roles;
  final String summary;
  final double width;

  /// What the line said of them so far (Gender, Age, Species), for their cameo.
  final Map<String, String> fields;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tone = castTone(id);
    final look = cameoLookOf(
      Entry({
        'id': id,
        'name': name,
        'category': 'character',
        'fields': [
          for (final MapEntry(:key, :value) in fields.entries) {'id': key, 'key': key, 'value': value},
        ],
      }),
      null,
    );
    final ink = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark
        ? const Color(0xFFFFF8EC)
        : const Color(0xFF1B140E);
    return ExcludeSemantics(
      child: Container(
        width: width,
        // A soft shadow under the card, as it will hang on the wall.
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 14, offset: const Offset(0, 5)),
          ],
        ),
        child: Material(
          color: scheme.surfaceContainerLow,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Their cameo, as it will hang on the wall: drawn from what the line says so far.
              AspectRatio(
                aspectRatio: 1,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  child: Cameo(
                    key: ValueKey(look),
                    look: look,
                    ground: [Color.lerp(tone, Colors.white, 0.1)!, Color.lerp(tone, Colors.black, 0.45)!],
                    ink: ink,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.isEmpty ? 'Their name' : name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: vaultHeading(
                        context,
                        size: 16,
                        weight: 700,
                        color: name.isEmpty ? scheme.onSurfaceVariant : scheme.onSurface,
                      ),
                    ),
                    if (epithet.isNotEmpty)
                      Text(
                        epithet,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: vaultText(context, size: 15, color: scheme.onSurfaceVariant, style: FontStyle.italic),
                      ),
                    if (summary.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        summary,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurface),
                      ),
                    ],
                    if (roles.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        roles.join(' · ').toUpperCase(),
                        maxLines: 2,
                        style: theme.textTheme.labelSmall?.copyWith(color: scheme.primary, letterSpacing: 1.2),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
