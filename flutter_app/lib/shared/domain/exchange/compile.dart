import '../codex/codex_changes.dart' show relatedTo;
import '../collation.dart';
import '../continuity/rules.dart' show filledFields;
import '../json.dart';
import '../manuscript/board.dart';
import '../manuscript/outline.dart' show isDocument;
import '../model/story_model.dart';
import '../model/story_order.dart' show stageAt;
import '../plot/plot_changes.dart' show planLabels, planTextFields;
import '../records/category.dart';
import '../records/entry.dart';
import '../records/story_node.dart';
import '../relationships/history.dart' show roleOf;
import '../relationships/relation_types.dart' show Affinity;
import '../snapshot/novel_snapshot.dart';
import '../stable_sort.dart';

/// What goes into an exported document. Each switch is independent.
class ExportOptions {
  const ExportOptions({
    required this.manuscript,
    required this.titles,
    required this.notes,
    required this.lore,
    required this.planning,
    required this.history,
    this.scopeId,
  });

  /// The text of chapters and scenes.
  final bool manuscript;

  /// Volume and chapter headings, and dividers between scenes.
  final bool titles;

  /// The author's private notes (on chapters, scenes and codex entries).
  final bool notes;

  /// Codex entries.
  final bool lore;

  /// Planning sheets for chapters and scenes.
  final bool planning;

  /// The log of saved versions, and the text of alternate drafts.
  final bool history;

  /// Export only this volume, arc or chapter (and what is inside it).
  final String? scopeId;

  /// The clean manuscript for readers.
  static const reader = ExportOptions(
    manuscript: true,
    titles: true,
    notes: false,
    lore: false,
    planning: false,
    history: false,
  );

  /// Everything an author works from: text, planning, notes and lore.
  static const bible = ExportOptions(
    manuscript: true,
    titles: true,
    notes: true,
    lore: true,
    planning: true,
    history: false,
  );

  ExportOptions copyWith({
    bool? manuscript,
    bool? titles,
    bool? notes,
    bool? lore,
    bool? planning,
    bool? history,
    String? Function()? scopeId,
  }) => ExportOptions(
    manuscript: manuscript ?? this.manuscript,
    titles: titles ?? this.titles,
    notes: notes ?? this.notes,
    lore: lore ?? this.lore,
    planning: planning ?? this.planning,
    history: history ?? this.history,
    scopeId: scopeId == null ? this.scopeId : scopeId(),
  );

  /// Whether the switches (not the part chosen) are the same as [other]'s.
  bool sameSwitches(ExportOptions other) =>
      manuscript == other.manuscript &&
      titles == other.titles &&
      notes == other.notes &&
      lore == other.lore &&
      planning == other.planning &&
      history == other.history;
}

/// A stretch of text with one formatting.
class Run {
  const Run(this.text, {this.bold = false, this.italic = false, this.underline = false, this.strike = false});
  final String text;
  final bool bold;
  final bool italic;
  final bool underline;
  final bool strike;

  bool sameStyle(Run other) =>
      bold == other.bold && italic == other.italic && underline == other.underline && strike == other.strike;

  JsonMap toJson() => {
    'text': text,
    if (bold) 'bold': true,
    if (italic) 'italic': true,
    if (underline) 'underline': true,
    if (strike) 'strike': true,
  };
}

enum HeadingRole { title, subtitle, part, chapter, section, entry, minor }

enum Align { left, center, right, justify }

/// The format-neutral document every exporter renders from: the hierarchy already resolved into heading roles and
/// levels, with the places a new page starts marked. Adding a format means writing one more renderer over these.
sealed class Block {
  const Block();
  JsonMap toJson();
}

class HeadingBlock extends Block {
  const HeadingBlock(this.role, this.level, this.text, {this.pageBreak = false});
  final HeadingRole role;
  final int level;
  final String text;
  final bool pageBreak;

  @override
  JsonMap toJson() => {
    'type': 'heading',
    'role': role.name,
    'level': level,
    'text': text,
    if (pageBreak) 'pageBreak': true,
  };
}

class ParagraphBlock extends Block {
  const ParagraphBlock(this.runs, {this.align, this.quote = false});
  final List<Run> runs;
  final Align? align;
  final bool quote;

  String get text => runs.map((r) => r.text).join();

  @override
  JsonMap toJson() => {
    'type': 'paragraph',
    'runs': [for (final r in runs) r.toJson()],
    if (align != null) 'align': align!.name,
    if (quote) 'quote': true,
  };
}

/// A scene break.
class DividerBlock extends Block {
  const DividerBlock();
  @override
  JsonMap toJson() => {'type': 'divider'};
}

/// A labelled line in a planning sheet or codex profile.
class FieldBlock extends Block {
  const FieldBlock(this.label, this.text);
  final String label;
  final String text;
  @override
  JsonMap toJson() => {'type': 'field', 'label': label, 'text': text};
}

class ListBlock extends Block {
  const ListBlock(this.items, {required this.ordered});
  final List<String> items;
  final bool ordered;
  @override
  JsonMap toJson() => {'type': 'list', 'ordered': ordered, 'items': items};
}

class Compiled {
  const Compiled({
    required this.title,
    required this.author,
    required this.blocks,
    required this.wordCount,
    required this.chapterCount,
  });
  final String title;
  final String author;
  final List<Block> blocks;

  /// Words of manuscript text included.
  final int wordCount;
  final int chapterCount;

  JsonMap toJson() => {
    'title': title,
    'author': author,
    'blocks': [for (final b in blocks) b.toJson()],
    'wordCount': wordCount,
    'chapterCount': chapterCount,
  };
}

List<Run> _runsOf(Object? nodes) {
  final runs = <Run>[];
  for (final node in maps(nodes)) {
    if (node['type'] == 'hardBreak') {
      runs.add(const Run('\n'));
    } else if (node['type'] == 'text' && str(node['text']).isNotEmpty) {
      final marks = {for (final m in maps(node['marks'])) m['type']};
      runs.add(
        Run(
          str(node['text']),
          bold: marks.contains('bold'),
          italic: marks.contains('italic'),
          underline: marks.contains('underline'),
          strike: marks.contains('strike'),
        ),
      );
    } else {
      runs.addAll(_runsOf(node['content']));
    }
  }
  return runs;
}

String _plain(List<Run> runs) => runs.map((r) => r.text).join();

/// Turns a saved chapter document into blocks, keeping its formatting and every blank line.
List<Block> docToBlocks(Object? doc, int headingLevel) {
  final blocks = <Block>[];
  void walk(JsonMap node, bool quote) {
    switch (node['type']) {
      case 'paragraph':
        final align = switch (mapOrNull(node['attrs'])?['textAlign']) {
          'center' => Align.center,
          'right' => Align.right,
          'justify' => Align.justify,
          _ => null,
        };
        blocks.add(ParagraphBlock(_runsOf(node['content']), align: align, quote: quote));
      case 'heading':
        final level = numOrNull(mapOrNull(node['attrs'])?['level']) ?? 1;
        blocks.add(
          HeadingBlock(HeadingRole.minor, _min6(headingLevel + level.toInt() - 1), _plain(_runsOf(node['content']))),
        );
      case 'horizontalRule':
        blocks.add(const DividerBlock());
      case 'bulletList' || 'orderedList':
        blocks.add(
          ListBlock([
            for (final item in maps(node['content'])) _plain(_runsOf(item['content'])),
          ], ordered: node['type'] == 'orderedList'),
        );
      default:
        for (final child in maps(node['content'])) {
          walk(child, quote || node['type'] == 'blockquote');
        }
    }
  }

  walk(mapOrNull(doc) ?? const {}, false);
  return blocks;
}

int _min6(int n) => n < 6 ? n : 6;

/// Words as the original export counted them: runs of non-space characters in paragraphs.
int _wordsOf(List<Block> blocks) =>
    blocks.fold(0, (n, b) => n + (b is ParagraphBlock ? RegExp(r'\S+').allMatches(b.text).length : 0));

List<Block> _text(String value) => [
  for (final line in value.split('\n')) ParagraphBlock(line.isEmpty ? const [] : [Run(line)]),
];

/// The record of a saved version that an export lists (not its text).
class _Revision {
  _Revision(JsonMap raw)
    : nodeId = str(raw['nodeId']),
      savedAt = numOrNull(raw['savedAt']) ?? 0,
      label = str(raw['label']),
      wordCount = intOrNull(raw['wordCount']) ?? 0,
      branchName = raw['branchName'] is String ? raw['branchName']! as String : null;
  final String nodeId;
  final num savedAt;
  final String label;
  final int wordCount;
  final String? branchName;
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "Oct 25, 2026, 12:34 PM", as an English browser writes a medium date and short time.
String _when(num millis) {
  final d = DateTime.fromMillisecondsSinceEpoch(millis.toInt());
  final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '${_months[d.month - 1]} ${d.day}, ${d.year}, $hour:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'AM' : 'PM'}';
}

String _thousands(int n) => n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

/// Builds the export document from a whole novel. Every optional kind of content is added in exactly one place below,
/// behind its own switch, so an unticked box can be verified by reading this function: private notes, planning, lore
/// and history cannot reach the output any other way. A port of the original app's `compile`.
Compiled compileNovel(NovelSnapshot snapshot, ExportOptions options) {
  final model = StoryModel.fromSnapshot(snapshot);
  final project = snapshot.project;
  final title = str(project['title']);
  final blocks = <Block>[];
  var wordCount = 0;
  var chapterCount = 0;

  // Rows in the order the original read them: by id.
  List<JsonMap> byId(String collection) =>
      [...snapshot.rows(collection)]..sort((a, b) => str(a['id']).compareTo(str(b['id'])));
  final docs = {for (final r in snapshot.rows('chapterContents')) str(r['id']): r['doc']};
  final nodesById = byId('chapters').map((r) => model.nodes[str(r['id'])]!).toList();
  final entries = [for (final r in byId('loreEntries')) model.entries[str(r['id'])]!];
  final entryById = {for (final e in entries) e.id: e};
  final links = [for (final r in byId('loreLinks')) ...model.links.where((l) => l.id == str(r['id']))];
  final relations = [for (final r in byId('characterRelations')) model.relations[str(r['id'])]!];

  final fullTree = buildTree(nodesById);
  TreeItem? find(List<TreeItem> items, String id) {
    for (final item in items) {
      if (item.node.id == id) return item;
      final inside = find(item.children, id);
      if (inside != null) return inside;
    }
    return null;
  }

  final scope = options.scopeId == null ? null : find(fullTree, options.scopeId!);
  final roots = scope != null ? [scope] : fullTree;
  final baseDepth = scope?.depth ?? 0;

  void heading(HeadingRole role, int level, String value, {bool pageBreak = false}) =>
      blocks.add(HeadingBlock(role, _min6(level), value, pageBreak: pageBreak));
  void field(String label, String value) {
    if (value.trim().isNotEmpty) blocks.add(FieldBlock(label, value));
  }

  // ----- Title page -----
  if (options.titles) {
    heading(HeadingRole.title, 1, scope != null ? '$title: ${scope.node.title}' : title);
    final subtitle = str(project['subtitle']);
    if (subtitle.isNotEmpty && scope == null) heading(HeadingRole.subtitle, 2, subtitle);
    final author = str(project['author']);
    if (author.isNotEmpty) blocks.add(ParagraphBlock([Run(author)], align: Align.center));
  }

  // ----- Planning sheet and private notes for one chapter or scene -----
  void sheets(StoryNode node, int level) {
    if (options.planning && isDocument(node.kind)) {
      final plan = model.plans[node.id];
      final entities = [for (final id in plan?.entityIds ?? const <String>[]) ?entryById[id]?.name];
      final filled =
          plan != null &&
          (planTextFields.any((f) => str(plan.raw[f]).trim().isNotEmpty) ||
              plan.beats.isNotEmpty ||
              entities.isNotEmpty);
      if (filled || node.summary.trim().isNotEmpty) {
        heading(HeadingRole.minor, level, 'Planning: ${node.title}');
        field('Status', node.status.label);
        if (plan != null) field(planLabels['objective']!, plan.objective);
        field('Summary', node.summary);
        if (plan != null && plan.beats.isNotEmpty) {
          blocks.add(const FieldBlock('Key events & plot beats', ''));
          blocks.add(ListBlock([for (final b in plan.beats) b.text], ordered: true));
        }
        field('Entities involved', entities.join(', '));
        if (plan != null) {
          for (final f in planTextFields.skip(1)) {
            field(planLabels[f]!, str(plan.raw[f]));
          }
        }
      }
    }
    if (options.notes && node.notes.trim().isNotEmpty) {
      heading(HeadingRole.minor, level, 'Author notes: ${node.title}');
      blocks.addAll(_text(node.notes));
    }
  }

  // ----- Manuscript, in reading order -----
  void visit(TreeItem item, StoryNode? previous) {
    final node = item.node;
    final depth = item.depth - baseDepth;
    final hasSheets =
        (options.planning || options.notes) &&
        (node.notes.trim().isNotEmpty || node.summary.trim().isNotEmpty || model.plans.containsKey(node.id));

    if (node.kind?.isGroup ?? false) {
      if (options.titles) heading(HeadingRole.part, 2 + depth, node.title, pageBreak: true);
      if (options.notes && node.notes.trim().isNotEmpty) sheets(node, 3 + depth);
    } else {
      final level = 2 + depth;
      // Headings typed inside the text sit one level below the chapter title (a scene has no title of its own).
      final body = options.manuscript
          ? docToBlocks(docs[node.id], node.kind == NodeKind.scene ? level : level + 1)
          : <Block>[];
      final hasText = body.any((b) => b is! ParagraphBlock || b.text.trim().isNotEmpty);
      if (node.kind == NodeKind.chapter) {
        chapterCount++;
        if (options.titles || (!options.manuscript && hasSheets)) {
          heading(HeadingRole.chapter, level, node.title, pageBreak: options.titles);
        } else if (previous != null && options.manuscript) {
          blocks.add(const ParagraphBlock([]));
        }
      } else if (options.titles && options.manuscript && previous != null && hasText) {
        // Scenes are separated by a divider rather than announced by name.
        blocks.add(const DividerBlock());
      } else if (!options.manuscript && hasSheets && !options.titles) {
        heading(HeadingRole.minor, level, node.title);
      }
      if (hasText) {
        blocks.addAll(body);
        wordCount += _wordsOf(body);
      }
      sheets(node, _min6(level + 1));
    }
    StoryNode? before = isDocument(node.kind) && options.manuscript && docs.containsKey(node.id) ? node : null;
    for (final child in item.children) {
      visit(child, child.node.kind == NodeKind.scene ? before : null);
      before = child.node;
    }
  }

  StoryNode? last;
  for (final root in roots) {
    visit(root, last);
    last = root.node;
  }

  // ----- Worldbuilding appendix -----
  if (options.lore && entries.isNotEmpty && scope == null) {
    heading(HeadingRole.section, 2, 'Worldbuilding', pageBreak: true);
    final List<Category> categories = model.categories.values.toList();
    for (final category in categories) {
      final inCategory = stableSorted(
        entries.where((e) => e.category == category.key),
        (Entry a, Entry b) => localeCompare(a.name, b.name),
      );
      if (inCategory.isEmpty) continue;
      heading(HeadingRole.section, 3, category.name);
      for (final entry in inCategory) {
        heading(HeadingRole.entry, 4, entry.name);
        if (entry.summary.trim().isNotEmpty) blocks.addAll(_text(entry.summary));
        for (final f in filledFields(entry, category, (id) => entryById[id]?.name)) {
          field(f.label, f.text);
        }
        if (entry.description.trim().isNotEmpty) blocks.addAll(_text(entry.description));
        field('Tags', entry.tags.join(', '));
        field(
          'Related entries',
          [
            for (final r in relatedTo(entry.id, entries, links))
              r.label.isNotEmpty ? '${r.entry.name} (${r.label})' : r.entry.name,
          ].join(', '),
        );
        // How this character stands with others at the end of the story.
        field(
          'Relationships',
          [
            for (final relation in relations)
              if (entryById[relation.fromId == entry.id
                      ? relation.toId
                      : relation.toId == entry.id
                      ? relation.fromId
                      : '']
                  case final other?)
                if (stageAt(relation, null, model.order) case final stage?)
                  '${other.name} (${roleOf(stage, relation, other.id)}, ${(Affinity.of(stage.affinity)?.label ?? stage.affinity).toLowerCase()})',
          ].join('; '),
        );
        if (options.notes) field('Author notes', entry.notes);
      }
    }
  }

  // ----- Revision history appendix -----
  if (options.history) {
    final inScope = {
      for (final root in roots) ...[root, ...flattenTree(root.children)].map((t) => t.node.id),
    };
    final versions = [
      for (final r in byId('chapterRevisions'))
        if (inScope.contains(str(r['nodeId']))) _Revision(r),
    ]..sort((a, b) => b.savedAt.compareTo(a.savedAt));
    final drafts = [
      for (final r in byId('chapterBranches'))
        if (inScope.contains(str(r['nodeId']))) r,
    ];
    if (versions.isNotEmpty || drafts.isNotEmpty) {
      heading(HeadingRole.section, 2, 'Revision history', pageBreak: true);
      for (final node in nodesById.where(
        (n) => versions.any((r) => r.nodeId == n.id) || drafts.any((b) => b['nodeId'] == n.id),
      )) {
        heading(HeadingRole.entry, 3, '${node.kind?.label ?? node.kindKey}: ${node.title}');
        final own = versions.where((r) => r.nodeId == node.id).toList();
        if (own.isNotEmpty) {
          blocks.add(
            ListBlock([
              for (final r in own)
                '${r.label.isNotEmpty ? r.label : 'Automatic version'} — ${_when(r.savedAt)} — ${_thousands(r.wordCount)} words — ${r.branchName ?? 'Main draft'}',
            ], ordered: false),
          );
        }
        for (final draft in drafts.where((b) => b['nodeId'] == node.id)) {
          heading(HeadingRole.minor, 4, 'Alternate draft: ${str(draft['name'])}');
          blocks.addAll(docToBlocks(draft['doc'], 5));
        }
      }
    }
  }

  return Compiled(
    title: title,
    author: str(project['author']),
    blocks: blocks,
    wordCount: wordCount,
    chapterCount: chapterCount,
  );
}
