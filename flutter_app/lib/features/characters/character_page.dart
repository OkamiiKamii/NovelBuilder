import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../app/theme/novel_art.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/motion/motion.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/page_scaffold.dart';
import '../../core/widgets/saved_text_field.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/text_prompt.dart';
import '../../shared/data/background.dart';
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
import 'tabs/status_tab.dart';
import 'widgets/cameo.dart';
import 'widgets/cast_card.dart' show castTone;
import 'widgets/character_card_share.dart';
import 'widgets/face_sketch.dart';
import 'widgets/journal_page.dart';
import 'widgets/portrait.dart';
import 'widgets/this_or_that.dart';
import 'widgets/vault.dart';
import 'widgets/vault_rail.dart';
import 'widgets/write_them_in_page.dart';

enum ProfilePage {
  /// Their sheet on the novel's system, as its own screen: only in a novel with systems, and there first.
  status('Status'),
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

  /// The tab [name] asks for, in a novel with or without [systems]: none asked, Status where there are systems and
  /// Overview where there are none (where Status is not a tab).
  static ProfilePage shown(String? name, {required bool systems}) {
    final asked = values.where((t) => t.name == name).firstOrNull;
    if (asked == null) return systems ? status : overview;
    return asked == status && !systems ? overview : asked;
  }

  /// The tabs of a novel with or without systems.
  static List<ProfilePage> tabs({required bool systems}) => [
    for (final p in values)
      if (p != status || systems) p,
  ];
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
    final systems = cast.model.systems.isNotEmpty;
    final compact = WindowSize.of(context) == WindowSize.compact;
    final entryNow = listed.entry;
    final profileNow = listed.profile;
    final secondaryActions = CharacterActions(context, cast.novelId);
    final List<(IconData, String, VoidCallback)> secondary = [
      // Getting to know them, a question at a time, while their profile still has empty answers.
      if (interviewFor(entryNow, profileNow, cast.templates).isNotEmpty)
        (
          Icons.record_voice_over_outlined,
          'Interview ${entryNow.name}',
          () => interviewCharacter(
            context,
            secondaryActions,
            entry: entryNow,
            profile: profileNow,
            templates: cast.templates,
          ),
        ),
      // Their temperament a quick choice at a time, into Core Traits (`widgets/this_or_that.dart`).
      (
        Icons.swap_horiz,
        'This or that',
        () => showThisOrThat(context, entry: entryNow, profile: profileNow, actions: secondaryActions),
      ),
      // Writing as them, to a prompt, on ruled paper; every page kept in their notes (`widgets/journal_page.dart`).
      (Icons.history_edu, '${entryNow.name}’s journal', () => showJournal(context, entryNow.id)),
      // Their card, as writers share their people (`widgets/character_card_share.dart`).
      (Icons.style_outlined, 'Share their card', () => showCharacterCard(context, cast: cast, entryId: entryNow.id)),
    ];
    final page = ProfilePage.shown(tab, systems: systems);
    final actions = CharacterActions(context, cast.novelId);
    final entry = listed.entry;
    final profile = listed.profile;
    final theme = Theme.of(context);
    final vault = Theme(
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
          // Through the cast without going back: the one before and after, on the same tab; or anyone, by search.
          IconButton(
            tooltip: 'Previous character (Alt+↑)',
            onPressed: vaultStep(cast, entry.id, -1) == null
                ? null
                : () => context.go(characterPath(vaultStep(cast, entry.id, -1)!, tab: tab)),
            icon: const Icon(Icons.keyboard_arrow_up),
          ),
          IconButton(
            tooltip: 'Next character (Alt+↓)',
            onPressed: vaultStep(cast, entry.id, 1) == null
                ? null
                : () => context.go(characterPath(vaultStep(cast, entry.id, 1)!, tab: tab)),
            icon: const Icon(Icons.keyboard_arrow_down),
          ),
          IconButton(
            tooltip: 'Find a character',
            onPressed: () => _find(context, cast, entry.id),
            icon: const Icon(Icons.person_search_outlined),
          ),
          // From them to the page: a scene with them, started from what is known of them
          // (`widgets/write_them_in_page.dart`).
          FilledButton.icon(
            onPressed: () => showWriteThemIn(context, cast, entry.id),
            icon: const Icon(Icons.edit_note),
            label: Text('Write ${entry.name} in'),
          ),
          // On a wide screen, each its own button; on a phone, in the menu, so the character is not pushed below a
          // column of buttons.
          for (final (icon, label, run) in secondary)
            if (!compact) OutlinedButton.icon(onPressed: run, icon: Icon(icon), label: Text(label)),
          _MoreMenu(cast: cast, listed: listed, actions: actions, extras: compact ? secondary : const []),
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
              tabs: ProfilePage.tabs(systems: systems),
              current: page,
              onSelect: (p) => context.go(characterPath(entry.id, tab: p.name)),
            ),
            const SizedBox(height: 16),
            KeyedSubtree(
              key: ValueKey('${entry.id}:${page.name}'),
              child: switch (page) {
                ProfilePage.status => StatusTab(
                  cast: cast,
                  listed: listed,
                  onOpen: (tab) => context.go(characterPath(entry.id, tab: tab)),
                ),
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
    return _framed(context, cast, entry.id, vault);
  }

  /// From this width the vault's list stands beside the page (the page itself is at most 1100 wide).
  static const railFrom = 1300.0;

  /// The page in the vault: the cast's list beside it where there is room, and Alt+↑ and Alt+↓ to the one before and
  /// after, on the same tab.
  Widget _framed(BuildContext context, CastData cast, String id, Widget vault) {
    void step(int by) {
      final next = vaultStep(cast, id, by);
      if (next != null) context.go(characterPath(next, tab: tab));
    }

    // Round the list and the page both: from the list's search too.
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.arrowUp, alt: true): () => step(-1),
        const SingleActivator(LogicalKeyboardKey.arrowDown, alt: true): () => step(1),
      },
      child: Focus(
        autofocus: true,
        child: LayoutBuilder(
          builder: (context, box) {
            if (box.maxWidth < railFrom) return vault;
            return Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 300,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 20, 8, 16),
                    child: VaultRail(cast: cast, currentId: id, tab: tab, onAdd: () => newCharacter(context, cast)),
                  ),
                ),
                const VerticalDivider(width: 1),
                Expanded(child: vault),
              ],
            );
          },
        ),
      ),
    );
  }

  /// The cast's list in a sheet, its search ready: to go to anyone from anywhere on a phone (or a narrow window).
  void _find(BuildContext context, CastData cast, String id) => showModalBottomSheet<void>(
    context: context,
    sheetAnimationStyle: sheetMotion(context),
    isScrollControlled: true,
    useRootNavigator: true,
    builder: (sheet) => SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(sheet).height * 0.8,
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(sheet).bottom),
          child: VaultRail(
            cast: cast,
            currentId: id,
            tab: tab,
            autofocus: true,
            onGone: () => Navigator.of(sheet).pop(),
            onAdd: () => newCharacter(context, cast),
          ),
        ),
      ),
    ),
  );
}

class _Tabs extends StatelessWidget {
  const _Tabs({required this.tabs, required this.current, required this.onSelect});

  final List<ProfilePage> tabs;
  final ProfilePage current;
  final ValueChanged<ProfilePage> onSelect;

  @override
  Widget build(BuildContext context) => DefaultTabController(
    key: ValueKey((current, tabs.length)),
    length: tabs.length,
    initialIndex: tabs.indexOf(current),
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
      onTap: (i) => onSelect(tabs[i]),
      tabs: [for (final p in tabs) Tab(text: p.label)],
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
    // Counted from the saved text of every chapter, after the page is drawn and away from the screen
    // (`background.dart`): the chapters are only read here, as stored; decoding and counting them is done in the
    // background, so a long book never holds up the page. Only the count for the names now shown is ever shown.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _mentionsFor != key) return;
      final run = ProviderScope.containerOf(context, listen: false).read(runAsideProvider);
      run(mentionsJob(widget.actions.service.storedChapters(widget.cast.novelId), [..._names])).then(
        (count) {
          if (mounted && _mentionsFor == key) setState(() => _mentions = count);
        },
        onError: (Object e, StackTrace s) =>
            FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
      );
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
    final named = widget.listed.seenIn.length;
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
          label: 'In the text',
          value: '${formatNumber(named)} ${named == 1 ? 'chapter' : 'chapters'}',
          tooltip: 'Chapters and scenes whose text has their name, an alias or their title, linked or not',
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
          // With no picture, their cameo, drawn from what is recorded of them (`cameo.dart`).
          child: uploaded
              ? Portrait(
                  name: entry.name,
                  image: image,
                  focal: profile.focal,
                  size: size,
                  label: 'Portrait of ${entry.name}',
                )
              : Semantics(
                  image: true,
                  label: '${entry.name} has no portrait: a cameo drawn from their profile',
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(size * 0.18),
                    child: SizedBox.square(
                      dimension: size,
                      child: Builder(
                        builder: (context) {
                          final look = NovelArt.of(
                            context,
                          ).bound(castTone(entry.id), lift: 0.1, sink: 0.45, tinted: true);
                          return Cameo(look: cameoLookOf(entry, profile), ground: look.ground, ink: look.ink);
                        },
                      ),
                    ),
                  ),
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
            // With no picture, their cameo is drawn from their profile; here, the author draws it (`face_sketch.dart`).
            if (!uploaded)
              TextButton.icon(
                onPressed: () => showDrawTheirFace(context, entry: entry, profile: profile, actions: actions),
                icon: const Icon(Icons.brush_outlined, size: 18),
                label: const Text('Draw their face'),
              ),
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
        // Status is chosen (Alive, Deceased, Missing, Unknown), the one set marked; a status of the author's own is
        // written under Your own, and kept and shown as one of the choices.
        Text('Status', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 4),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            for (final s in {...characterStatuses, if (profile.status.trim().isNotEmpty) profile.status.trim()})
              ChoiceChip(
                label: Text(s),
                selected: profile.status.trim() == s,
                onSelected: (on) =>
                    widget.actions.now((c) => c.identity(entry.id, IdentityChanges(status: on ? s : ''))),
              ),
          ],
        ),
        const SizedBox(height: 4),
        SavedTextField(
          key: ValueKey('status-own:${characterStatuses.contains(profile.status.trim())}'),
          label: 'Your own',
          hint: 'Imprisoned, Exiled, Ascended…',
          value: characterStatuses.contains(profile.status.trim()) ? '' : profile.status,
          onChanged: (v) {
            if (v.trim().isNotEmpty) _save('status', IdentityChanges(status: v));
          },
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
  const _MoreMenu({required this.cast, required this.listed, required this.actions, this.extras = const []});

  final CastData cast;
  final Listed listed;
  final CharacterActions actions;

  /// What a wider screen shows as buttons beside the menu (on a phone, first in it).
  final List<(IconData, String, VoidCallback)> extras;

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
        final other when other.startsWith('extra:') => extras[int.parse(other.substring(6))].$3(),
        _ => null,
      },
      itemBuilder: (_) => [
        for (final (i, (icon, label, _)) in extras.indexed)
          PopupMenuItem(
            value: 'extra:$i',
            child: ListTile(leading: Icon(icon), title: Text(label), contentPadding: EdgeInsets.zero),
          ),
        if (extras.isNotEmpty) const PopupMenuDivider(),
        const PopupMenuItem(value: 'layout', child: Text('Add sections from a layout…')),
        const PopupMenuItem(value: 'template', child: Text('Save this layout as a template…')),
        PopupMenuItem(value: 'archive', child: Text(archived ? 'Restore from the archive' : 'Archive')),
        const PopupMenuItem(value: 'delete', child: Text('Delete…')),
      ],
    );
  }
}
