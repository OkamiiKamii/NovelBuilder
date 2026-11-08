import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';
import '../characters/widgets/vault.dart';

/// JOT AN IDEA: at the head of the Ideas shelf, one line to catch an idea before it goes: a title (and, after a dash or
/// a colon, its premise if it comes with one: "Salt Court — a queen who cannot lie"), and **Shelve it** (or Enter)
/// stands it on the shelf as an idea, without the title page or anything opened. The line clears for the next.
class IdeaJot extends ConsumerStatefulWidget {
  const IdeaJot({super.key});

  @override
  ConsumerState<IdeaJot> createState() => _IdeaJotState();
}

/// A jotted line as a title and a premise: what comes after the first " — ", " - " or ": " is the premise.
({String title, String premise}) readJot(String line) {
  final text = line.trim();
  final at = RegExp(r'\s+[—–-]\s+|:\s+').firstMatch(text);
  if (at == null || at.start == 0) return (title: text, premise: '');
  return (title: text.substring(0, at.start).trim(), premise: text.substring(at.end).trim());
}

class _IdeaJotState extends ConsumerState<IdeaJot> {
  final _line = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _line.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _shelve() {
    final jot = readJot(_line.text);
    if (jot.title.isEmpty) return;
    ref.read(libraryServiceProvider).create({
      'title': jot.title,
      'status': 'planning',
      if (jot.premise.isNotEmpty) 'synopsis': jot.premise,
    });
    _line.clear();
    setState(() {});
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('“${jot.title}” is on the Ideas shelf.')));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ready = _line.text.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: TextField(
              controller: _line,
              focusNode: _focus,
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => _shelve(),
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.done,
              style: vaultText(context, size: 17),
              decoration: InputDecoration(
                labelText: 'Jot an idea',
                hintText: 'A title — and its premise, if you have one',
                prefixIcon: Icon(Icons.lightbulb_outline, color: scheme.primary),
              ),
            ),
          ),
          const SizedBox(width: 10),
          FilledButton.tonal(onPressed: ready ? _shelve : null, child: const Text('Shelve it')),
        ],
      ),
    );
  }
}
