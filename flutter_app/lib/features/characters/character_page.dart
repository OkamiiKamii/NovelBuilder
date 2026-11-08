import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/text_prompt.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/characters/cast.dart';
import '../../shared/domain/characters/character_changes.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/records/entry.dart';
import '../progression/progression_providers.dart';
import '../progression/progression_tab.dart';
import 'character_actions.dart';
import 'characters_providers.dart';
import 'data/portrait_image.dart';
import 'interview.dart';
import 'tabs/details_tab.dart';
import 'tabs/history_tab.dart';
import 'tabs/notes_tab.dart';
import 'tabs/overview_tab.dart';
import 'tabs/relationships_tab.dart';
import 'tabs/secrets_tab.dart';
import 'widgets/portrait.dart';
import 'widgets/vault.dart';

enum ProfilePage {
  overview('Overview'),
  relationships('Relationships'),
  details('Details'),
  progression('Progression'),
  secrets('Secrets'),
  notes('Notes'),
  history('History');

  const ProfilePage(this.label);
  final String label;

  static ProfilePage of(String? name) => values.where((t) => t.name == name).firstOrNull ?? overview;
}

const _referenceWords = [
  ('chapters', 'chapter or scene links to them', 'chapters and scenes link to them'),
  ('relationships', 'relationship', 'relationships'),
  ('events', 'timeline event', 'timeline events'),
  ('threads', 'plot thread', 'plot threads'),
  ('links', 'link to a faction, item or other entry', 'links to factions, items and other entries'),
  ('sheets', 'system sheet', 'system sheets'),
  ('snapshots', 'progression snapshot', 'progression snapshots'),
  ('secrets', 'secret of their own', 'secrets of their own'),
  ('inSecrets', 'other character’s secret names them', 'other characters’ secrets name them'),
  ('notes', 'note', 'notes'),
];

/// CHARACTER PROFILE: everything about one character, on six tabs. It is a view of the one record every other feature
/// uses; opening the character from a chapter or a search leads here.
class CharacterPage extends ConsumerWidget {
  const CharacterPage({super.key, required this.entryId, this.tab});

  final String entryId;
  final String? tab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cast = ref.watch(castProvider);
    final listed = cast?.listed(entryId);
    if (cast == null || listed == null) {
      return PageScaffold(
        title: 'Character not found',
        child: EmptyState(
          icon: Icons.person_off_outlined,
          title: 'Character not found',
          message: cast == null
              ? 'No novel is open. Open one from the Library.'
              : 'It may have been deleted, or the link is to something that is not a character.',
          action: FilledButton(
            onPressed: () => context.go(cast == null ? Destination.library.path : Destination.organize.path),
            child: Text(cast == null ? 'Go to Library' : 'Characters'),
          ),
        ),
      );
    }
    final page = ProfilePage.of(tab);
    final actions = CharacterActions(context, cast.novelId);
    final entry = listed.entry;
    final profile = listed.profile;
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(
        textTheme: theme.textTheme.copyWith(headlineSmall: vaultHeading(context, size: 26, weight: 700)),
      ),
      child: PageScaffold(
        title: 'Character Vault',
        maxWidth: 1100,
        actions: [
          TextButton.icon(
            onPressed: () => context.go(Destination.organize.path),
            icon: const Icon(Icons.arrow_back),
            label: const Text('All characters'),
          ),
          // Getting to know them, a question at a time, while their profile still has empty answers.
          if (interviewFor(entry, profile, cast.templates).isNotEmpty)
            FilledButton.icon(
              onPressed: () =>
                  interviewCharacter(context, actions, entry: entry, profile: profile, templates: cast.templates),
              icon: const Icon(Icons.record_voice_over_outlined),
              label: Text('Interview ${entry.name}'),
            ),
          _MoreMenu(cast: cast, listed: listed, actions: actions),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (profile.archived) ...[
              MaterialBanner(
                content: const Text(
                  'This character is archived: out of the library, with everything about them kept and every reference '
                  'to them still working.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => actions.now((c) => c.setArchived(entry.id, false)),
                    child: const Text('Restore'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            _Header(key: ValueKey('header:${entry.id}'), cast: cast, listed: listed, actions: actions),
            const SizedBox(height: 16),
            _Tabs(
              current: page,
              onSelect: (p) => context.go(characterPath(entry.id, tab: p.name)),
            ),
            const SizedBox(height: 16),
            KeyedSubtree(
              key: ValueKey('${entry.id}:${page.name}'),
              child: switch (page) {
                ProfilePage.overview => OverviewTab(cast: cast, listed: listed, actions: actions),
                ProfilePage.relationships => RelationshipsTab(cast: cast, entry: entry, actions: actions),
                ProfilePage.details => DetailsTab(cast: cast, entry: entry, profile: profile, actions: actions),
                ProfilePage.progression => ProgressionTab(
                  cast: cast,
                  entry: entry,
                  actions: ProgressionActions(context, cast.novelId),
                ),
                ProfilePage.secrets => SecretsTab(cast: cast, entry: entry, actions: actions),
                ProfilePage.notes => NotesTab(cast: cast, entry: entry, profile: profile, actions: actions),
                ProfilePage.history => HistoryTab(cast: cast, entry: entry, actions: actions),
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({required this.current, required this.onSelect});

  final ProfilePage current;
  final ValueChanged<ProfilePage> onSelect;

  @override
  Widget build(BuildContext context) => DefaultTabController(
    key: ValueKey(current),
    length: ProfilePage.values.length,
    initialIndex: current.index,
    child: TabBar(
      isScrollable: true,
      tabAlignment: TabAlignment.start,
      labelStyle: vaultHeading(context, size: 14),
      unselectedLabelStyle: vaultHeading(context, size: 14, weight: 400),
      labelColor: Theme.of(context).colorScheme.onSurface,
      unselectedLabelColor: Theme.of(context).colorScheme.onSurfaceVariant,
      indicatorColor: Theme.of(context).colorScheme.primary,
      indicatorWeight: 2.5,
      dividerColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.35),
      onTap: (i) => onSelect(ProfilePage.values[i]),
      tabs: [for (final p in ProfilePage.values) Tab(text: p.label)],
    ),
  );
}

/// The top of a profile: who this is. Read by default; "Edit profile" turns the same block into fields.
class _Header extends StatefulWidget {
  const _Header({super.key, required this.cast, required this.listed, required this.actions});

  final CastData cast;
  final Listed listed;
  final CharacterActions actions;

  @override
  State<_Header> createState() => _HeaderState();
}

class _HeaderState extends State<_Header> {
  bool _editing = false;
  int? _mentions;
  String _mentionsFor = '';

  List<String> get _names => [
    widget.listed.entry.name,
    widget.listed.profile.epithet,
    ...widget.listed.profile.aliases,
  ];

  void _countMentions() {
    final key = _names.join('\n');
    if (key == _mentionsFor) return;
    _mentionsFor = key;
    _mentions = null;
    // Counted from the saved text of every chapter, after the page is drawn, so a long book never holds it up.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _mentionsFor != key) return;
      final count = widget.actions.service.nameMentions(widget.cast.novelId, _names);
      if (mounted && _mentionsFor == key) setState(() => _mentions = count);
    });
  }

  @override
  Widget build(BuildContext context) {
    _countMentions();
    final theme = Theme.of(context);
    final entry = widget.listed.entry;
    final profile = widget.listed.profile;
    final wide = WindowSize.of(context) != WindowSize.compact;
    final portrait = _PortraitTools(entry: entry, profile: profile, actions: widget.actions, size: wide ? 200 : 140);
    final facts = identityFacts(widget.cast, entry, profile);
    final who = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(
            entry.name,
            style: vaultHeading(context, size: wide ? 34 : 26, weight: 700, color: theme.colorScheme.onSurface),
          ),
        ),
        if (profile.epithet.isNotEmpty)
          Text(
            profile.epithet,
            style: vaultText(context, size: wide ? 24 : 20, color: theme.colorScheme.primary),
          ),
        const VaultRule(),
        if (facts.isNotEmpty) ...[
          Wrap(
            spacing: 32,
            runSpacing: 16,
            children: [
              for (final f in facts)
                ConstrainedBox(
                  constraints: const BoxConstraints(minWidth: 140, maxWidth: 220),
                  child: VaultFact(name: f.name, value: f.value),
                ),
            ],
          ),
          const SizedBox(height: 16),
        ],
      ],
    );
    final identity = _editing
        ? _IdentityForm(
            entry: entry,
            profile: profile,
            actions: widget.actions,
            onDone: () => setState(() => _editing = false),
          )
        : _IdentityView(entry: entry, profile: profile, onEdit: () => setState(() => _editing = true));
    final linked = widget.listed.linkedIn.length;
    final stats = Wrap(
      spacing: 24,
      runSpacing: 8,
      children: [
        _Stat(
          label: 'Linked in',
          value: '${formatNumber(linked)} ${linked == 1 ? 'chapter' : 'chapters'}',
          tooltip: 'Chapters and scenes whose text has a link to this character',
        ),
        _Stat(
          label: 'Name mentions',
          value: _mentions == null ? '…' : formatNumber(_mentions!),
          tooltip:
              'Times their name, aliases or title occur in the text. Words on the page, not a count of appearances.',
        ),
      ],
    );
    return VaultFrame(
      padding: EdgeInsets.all(wide ? 20 : 16),
      child: wide
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                portrait,
                const SizedBox(width: 28),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [who, identity, const SizedBox(height: 16), stats],
                  ),
                ),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                portrait,
                const SizedBox(height: 12),
                who,
                identity,
                const SizedBox(height: 12),
                DefaultTextStyle.merge(style: theme.textTheme.bodySmall, child: stats),
              ],
            ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.tooltip});
  final String label;
  final String value;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Semantics(
        label: '$label: $value. $tooltip',
        excludeSemantics: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: vaultHeading(context, size: 12)),
            Text(value, style: vaultText(context, size: 22)),
          ],
        ),
      ),
    );
  }
}

class _PortraitTools extends StatelessWidget {
  const _PortraitTools({required this.entry, required this.profile, required this.actions, required this.size});

  final Entry entry;
  final CharacterProfile profile;
  final CharacterActions actions;
  final double size;

  @override
  Widget build(BuildContext context) {
    final image = entry.image;
    final uploaded = uploadedImageBytes(image) != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            border: Border.all(color: Theme.of(context).colorScheme.primary, width: 1.5),
            borderRadius: BorderRadius.circular(size * 0.18 + 3),
          ),
          child: Portrait(
            name: entry.name,
            image: image,
            focal: profile.focal,
            size: size,
            label: image == null ? '${entry.name} has no portrait' : 'Portrait of ${entry.name}',
          ),
        ),
        if (image != null && !uploaded)
          SizedBox(
            width: 160,
            child: Text(
              'This portrait is a web address. This app does not fetch pictures from the web, so it is kept but not '
              'shown.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        Wrap(
          children: [
            TextButton(
              onPressed: () => _upload(context),
              child: Text(image == null ? 'Upload portrait' : 'Replace portrait'),
            ),
            if (image != null) ...[
              if (uploaded)
                TextButton(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (_) => _FocalDialog(entry: entry, profile: profile, actions: actions),
                  ),
                  child: const Text('Adjust crop'),
                ),
              TextButton(
                onPressed: () async {
                  final ok = await showConfirmDialog(
                    context,
                    title: 'Remove the portrait?',
                    message:
                        'The picture is removed from ${entry.name}’s record. A restore point or a backup still '
                        'has it.',
                    confirmLabel: 'Remove portrait',
                    destructive: true,
                  );
                  if (ok) actions.now((c) => c.identity(entry.id, const IdentityChanges(image: (value: null))));
                },
                child: const Text('Remove portrait'),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Future<void> _upload(BuildContext context) async {
    final files = ProviderScope.containerOf(context, listen: false).read(backupFilesProvider);
    final picked = await files.pickImage();
    if (picked == null) return;
    try {
      final image = await portraitDataUrl(picked.bytes);
      actions.now((c) => c.identity(entry.id, IdentityChanges(image: (value: image))));
    } on UnreadableImage catch (e) {
      actions.tell('$e');
    }
  }
}

/// Choosing the point of the portrait to keep in view when it is cropped. The whole picture is kept.
class _FocalDialog extends StatefulWidget {
  const _FocalDialog({required this.entry, required this.profile, required this.actions});
  final Entry entry;
  final CharacterProfile profile;
  final CharacterActions actions;

  @override
  State<_FocalDialog> createState() => _FocalDialogState();
}

class _FocalDialogState extends State<_FocalDialog> {
  late Focal _focal = widget.profile.focal;

  @override
  Widget build(BuildContext context) {
    final bytes = uploadedImageBytes(widget.entry.image)!;
    return AlertDialog(
      title: const Text('Adjust the portrait’s crop'),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Tap the part of the picture to keep in view. The whole picture is kept; this only chooses what shows '
              'when it is cropped.',
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, constraints) => GestureDetector(
                onTapDown: (d) {
                  final box = context.size!;
                  setState(
                    () => _focal = (
                      x: (d.localPosition.dx / box.width * 100).clamp(0, 100).toDouble(),
                      y: (d.localPosition.dy / box.height * 100).clamp(0, 100).toDouble(),
                    ),
                  );
                },
                child: Semantics(
                  label: 'Choose the point of the portrait to keep in view',
                  child: Stack(
                    children: [
                      Image.memory(bytes, width: constraints.maxWidth, fit: BoxFit.fitWidth),
                      Positioned.fill(
                        child: Align(
                          alignment: Alignment(_focal.x / 50 - 1, _focal.y / 50 - 1),
                          child: const Icon(Icons.adjust, color: Colors.white, shadows: [Shadow(blurRadius: 4)]),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              children: [
                for (final size in [96.0, 64.0, 40.0])
                  Portrait(name: widget.entry.name, image: widget.entry.image, focal: _focal, size: size),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            widget.actions.now((c) => c.identity(widget.entry.id, IdentityChanges(focal: _focal)));
            Navigator.of(context).pop();
          },
          child: const Text('Done'),
        ),
      ],
    );
  }
}

class _IdentityView extends StatelessWidget {
  const _IdentityView({required this.entry, required this.profile, required this.onEdit});
  final Entry entry;
  final CharacterProfile profile;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodyMedium?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
      fontStyle: FontStyle.italic,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final r in profile.roles) Chip(label: Text(r), visualDensity: VisualDensity.compact),
            if (profile.status.isNotEmpty)
              Chip(
                avatar: const Icon(Icons.info_outline, size: 16),
                label: Text(profile.status),
                visualDensity: VisualDensity.compact,
              ),
            if (profile.archived)
              const Chip(
                avatar: Icon(Icons.inventory_2_outlined, size: 16),
                label: Text('Archived'),
                visualDensity: VisualDensity.compact,
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (entry.summary.isNotEmpty) Text(entry.summary) else Text('No summary yet.', style: muted),
        if (profile.aliases.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text('Also known as: ${profile.aliases.join(', ')}', style: theme.textTheme.bodySmall),
        ],
        if (entry.tags.isNotEmpty) Text('Tags: ${entry.tags.join(', ')}', style: theme.textTheme.bodySmall),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: onEdit,
          icon: const Icon(Icons.edit_outlined),
          label: const Text('Edit profile'),
        ),
      ],
    );
  }
}

class _IdentityForm extends StatefulWidget {
  const _IdentityForm({required this.entry, required this.profile, required this.actions, required this.onDone});
  final Entry entry;
  final CharacterProfile profile;
  final CharacterActions actions;
  final VoidCallback onDone;

  @override
  State<_IdentityForm> createState() => _IdentityFormState();
}

class _IdentityFormState extends State<_IdentityForm> {
  bool _blankName = false;
  final _ownRole = TextEditingController();

  @override
  void dispose() {
    _ownRole.dispose();
    super.dispose();
  }

  void _save(String what, IdentityChanges changes) =>
      widget.actions.later('identity:${widget.entry.id}:$what', (c) => c.identity(widget.entry.id, changes));

  void _roles(List<String> roles) =>
      widget.actions.now((c) => c.identity(widget.entry.id, IdentityChanges(roles: roles)));

  @override
  Widget build(BuildContext context) {
    final entry = widget.entry;
    final profile = widget.profile;
    final roles = {...characterRoles, ...profile.roles}.toList();
    const gap = SizedBox(height: 12);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SavedTextField(
          label: 'Name',
          value: entry.name,
          errorText: _blankName ? 'A character needs a name. The name they had is kept until you give one.' : null,
          onChanged: (v) {
            setState(() => _blankName = v.trim().isEmpty);
            if (v.trim().isNotEmpty) _save('name', IdentityChanges(name: v));
          },
        ),
        gap,
        SavedTextField(
          label: 'Title or epithet',
          hint: 'The Last Heir',
          value: profile.epithet,
          onChanged: (v) => _save('epithet', IdentityChanges(epithet: v)),
        ),
        gap,
        Text('Narrative role (one or several)', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 4),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final role in roles)
              FilterChip(
                label: Text(role),
                selected: profile.roles.contains(role),
                onSelected: (on) => _roles(
                  on
                      ? [...profile.roles, role]
                      : [
                          for (final r in profile.roles)
                            if (r != role) r,
                        ],
                ),
              ),
            SizedBox(
              width: 180,
              child: TextField(
                controller: _ownRole,
                decoration: const InputDecoration(hintText: 'A role of your own', isDense: true),
                onSubmitted: (v) {
                  if (v.trim().isEmpty) return;
                  _roles([...profile.roles, v]);
                  _ownRole.clear();
                },
              ),
            ),
          ],
        ),
        gap,
        SavedTextField(
          label: 'Summary',
          value: entry.summary,
          multiline: true,
          onChanged: (v) => _save('summary', IdentityChanges(summary: v)),
        ),
        gap,
        SavedTextField(
          label: 'Aliases and nicknames (comma separated)',
          value: profile.aliases.join(', '),
          onChanged: (v) => _save('aliases', IdentityChanges(aliases: v.split(','))),
        ),
        gap,
        SavedTextField(
          label: 'Status',
          hint: 'Alive, Deceased… or your own',
          value: profile.status,
          onChanged: (v) => _save('status', IdentityChanges(status: v)),
        ),
        Wrap(
          spacing: 6,
          children: [
            for (final s in characterStatuses)
              ActionChip(
                label: Text(s),
                onPressed: () => widget.actions.now((c) => c.identity(entry.id, IdentityChanges(status: s))),
              ),
          ],
        ),
        gap,
        SavedTextField(
          label: 'Tags (comma separated)',
          value: entry.tags.join(', '),
          onChanged: (v) => _save('tags', IdentityChanges(tags: v.split(','))),
        ),
        gap,
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton(onPressed: widget.onDone, child: const Text('Done')),
        ),
      ],
    );
  }
}

class _MoreMenu extends StatelessWidget {
  const _MoreMenu({required this.cast, required this.listed, required this.actions});

  final CastData cast;
  final Listed listed;
  final CharacterActions actions;

  Future<void> _applyTemplate(BuildContext context) async {
    final picked = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Add sections from a layout'),
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 24),
            child: Text('Only the sections this profile does not have yet are added. Nothing already here changes.'),
          ),
          for (final t in cast.templates)
            SimpleDialogOption(
              onPressed: () => Navigator.of(context).pop(t.id),
              child: ListTile(title: Text(t.name), subtitle: Text(t.description)),
            ),
        ],
      ),
    );
    if (picked != null) actions.now((c) => c.applyTemplate(listed.entry.id, picked));
  }

  Future<void> _saveTemplate(BuildContext context) async {
    final name = await showTextPrompt(
      context,
      title: 'Save this layout as a template',
      label: 'Template name',
      initial: '${listed.entry.name}’s layout',
      hint: 'Its sections and the names and types of their fields, not what is written in them.',
      confirmLabel: 'Save template',
    );
    if (name == null || name.trim().isEmpty) return;
    final saved = actions.now((c) => c.saveTemplate(listed.entry.id, name));
    if (saved != null) actions.tell('Saved “${saved.name}”. It is offered when you create a character in this novel.');
  }

  Future<void> _delete(BuildContext context) async {
    final entry = listed.entry;
    final refs = actions.service.references(cast.novelId, entry.id);
    final said = [
      for (final (key, one, many) in _referenceWords)
        if (refs[key] > 0) '${formatNumber(refs[key])} ${refs[key] == 1 ? one : many}',
    ];
    final choice = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete ${entry.name}?'),
        scrollable: true,
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('This deletes ${entry.name}: the record, the profile, and their secrets, notes and history.'),
            const SizedBox(height: 8),
            if (said.isEmpty)
              const Text('Nothing else in the novel refers to them.')
            else ...[
              const Text('They are referred to elsewhere:'),
              for (final s in said) Text('•  $s'),
              const SizedBox(height: 8),
              const Text(
                'Their relationships, links and secrets go with them. The manuscript’s words are not touched: a '
                'linked name stays as plain text. Timeline events, plot threads and other characters’ secrets are kept '
                'and simply no longer show them.',
              ),
            ],
            const SizedBox(height: 8),
            const Text('A restore point is kept first (Settings → Restore points), so it can be brought back.'),
          ],
        ),
        actions: [
          TextButton(autofocus: true, onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          if (!listed.profile.archived)
            TextButton(onPressed: () => Navigator.of(context).pop('archive'), child: const Text('Archive instead')),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            onPressed: () => Navigator.of(context).pop('delete'),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (choice == 'archive') {
      actions.now((c) => c.setArchived(entry.id, true));
    } else if (choice == 'delete') {
      actions.flush();
      try {
        final kept = actions.service.delete(cast.novelId, entry.id, name: entry.name);
        actions.router.go(Destination.organize.path);
        actions.tell(
          'Deleted ${entry.name}.',
          actionLabel: 'Undo',
          onAction: () {
            actions.service.undoDelete(kept);
            actions.openCharacter(entry.id);
          },
        );
      } on Object catch (e) {
        actions.tell('Deleting failed, and nothing was changed: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final archived = listed.profile.archived;
    return PopupMenuButton<String>(
      tooltip: 'More options for ${listed.entry.name}',
      useRootNavigator: true,
      icon: const Icon(Icons.more_vert),
      onSelected: (action) => switch (action) {
        'layout' => _applyTemplate(context),
        'template' => _saveTemplate(context),
        'archive' => actions.now((c) => c.setArchived(listed.entry.id, !archived)),
        'delete' => _delete(context),
        _ => null,
      },
      itemBuilder: (_) => [
        const PopupMenuItem(value: 'layout', child: Text('Add sections from a layout…')),
        const PopupMenuItem(value: 'template', child: Text('Save this layout as a template…')),
        PopupMenuItem(value: 'archive', child: Text(archived ? 'Restore from the archive' : 'Archive')),
        const PopupMenuItem(value: 'delete', child: Text('Delete…')),
      ],
    );
  }
}
