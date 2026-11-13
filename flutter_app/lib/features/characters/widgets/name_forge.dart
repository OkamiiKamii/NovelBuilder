import 'package:flutter/material.dart';

import '../../../app/theme/book_faces.dart';
import '../../../core/layout/breakpoints.dart';
import '../../../shared/domain/text/name_forge.dart';
import 'vault.dart';

/// THE NAME FORGE as a sheet (`shared/domain/text/name_forge.dart` forges them): a dozen names in a tradition (the
/// book's own names, when it has enough of them, or Old English, Norse, Latin, Lyrical, Desert, Steppe), for a person
/// or a place, beginning with letters of the author's choosing. A press takes one; More names forges another dozen.
/// Resolves with the name taken, or null.
Future<String?> showNameForge(
  BuildContext context, {
  List<String> people = const [],
  List<String> places = const [],
  bool place = false,
}) {
  final body = _NameForge(people: learnableNames(people), places: learnableNames(places), place: place);
  if (WindowSize.of(context) == WindowSize.compact) {
    return showModalBottomSheet<String>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SafeArea(child: SingleChildScrollView(child: body)),
    );
  }
  return showDialog<String>(
    context: context,
    builder: (_) => Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: SingleChildScrollView(child: body),
      ),
    ),
  );
}

/// The key of the book's own names among the traditions.
const _book = 'book';

class _NameForge extends StatefulWidget {
  const _NameForge({required this.people, required this.places, required this.place});

  final List<String> people;
  final List<String> places;
  final bool place;

  @override
  State<_NameForge> createState() => _NameForgeState();
}

class _NameForgeState extends State<_NameForge> {
  late bool _place = widget.place;
  late String _flavour = _bookCanForge(widget.place) ? _book : nameFlavours.first.key;
  final _start = TextEditingController();
  int _seed = DateTime.now().millisecondsSinceEpoch % 100000;

  List<String> _bookNames(bool place) => place ? widget.places : widget.people;
  bool _bookCanForge(bool place) => _bookNames(place).length >= forgeMinNames;

  @override
  void dispose() {
    _start.dispose();
    super.dispose();
  }

  List<String> _names() {
    if (_flavour == _book) {
      return forgeNames(source: _bookNames(_place), seed: _seed, start: _start.text);
    }
    final f = nameFlavours.firstWhere((f) => f.key == _flavour);
    return forgeNames(source: f.people, seed: _seed, place: _place, placeEndings: f.placeEndings, start: _start.text);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final names = _names();
    final bookReady = _bookCanForge(_place);
    if (_flavour == _book && !bookReady) _flavour = nameFlavours.first.key;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text('Forge a name', style: vaultHeading(context, size: 22, color: scheme.onSurface)),
          ),
          const SizedBox(height: 4),
          Text(
            'New names in the shape of old ones: none of them is a name it learned from.',
            style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, icon: Icon(Icons.person_outline), label: Text('A person')),
              ButtonSegment(value: true, icon: Icon(Icons.place_outlined), label: Text('A place')),
            ],
            selected: {_place},
            onSelectionChanged: (s) => setState(() => _place = s.first),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              ChoiceChip(
                label: const Text('Like your book'),
                selected: _flavour == _book,
                onSelected: bookReady ? (_) => setState(() => _flavour = _book) : null,
                tooltip: bookReady
                    ? 'In the shape of the ${_place ? 'places' : 'people'} in your book'
                    : 'Needs $forgeMinNames ${_place ? 'places' : 'people'} in your book to learn from',
              ),
              for (final f in nameFlavours)
                ChoiceChip(
                  label: Text(f.label),
                  selected: _flavour == f.key,
                  onSelected: (_) => setState(() => _flavour = f.key),
                ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _start,
            maxLength: 3,
            decoration: const InputDecoration(
              labelText: 'Starts with',
              hintText: 'Any letters',
              isDense: true,
              counterText: '',
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 16),
          if (names.isEmpty)
            Text('Nothing came out right. Try other letters.', style: vaultText(context, size: 15))
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final n in names)
                  ActionChip(
                    label: Text(
                      n,
                      style: TextStyle(fontFamily: BookFaces.of(context).text, fontSize: 17, color: scheme.onSurface),
                    ),
                    tooltip: 'Use “$n”',
                    onPressed: () => Navigator.of(context).pop(n),
                  ),
              ],
            ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: () => setState(() => _seed++),
              icon: const Icon(Icons.refresh),
              label: const Text('More names'),
            ),
          ),
        ],
      ),
    );
  }
}
