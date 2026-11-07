import '../collation.dart';
import '../continuity/rules.dart' show filledFields;
import '../json.dart';
import '../manuscript/prose.dart' show docBlocks;
import '../plot/plot_changes.dart' show planLabels, planTextFields;
import '../records/category.dart';
import '../records/entry.dart';
import '../records/story_node.dart';

/// SEARCH ACROSS THE WHOLE NOVEL, as the original app's `src/modules/search`: every chapter and scene (title, headings,
/// text, summary, notes, plan) and every codex entry (name, summary, description, tags, fields as a reader sees them,
/// notes) flattened into blocks with a precise address; a query finds the records holding every word of it (in the
/// chosen scope), ranks them by where the words are, and shows the strongest passages in reading order. Read only: it
/// never changes the novel.

/// `node` (a chapter, scene or group) or `entry` (a codex entry).
enum SearchEntityType { node, entry }

/// What a block of text is: a title, a heading or paragraph of text, a summary, notes, a plan field, or an entry's
/// name, description, tags or one of its fields.
enum SearchField { title, heading, body, summary, notes, plan, name, description, tags, attribute }

/// Where to look: everything, the manuscript, the codex, or the author's notes.
enum SearchScope {
  all('Everything'),
  manuscript('Manuscript'),
  codex('Codex'),
  notes('Notes');

  const SearchScope(this.label);
  final String label;
}

/// One block of text with a precise address. [group] is `manuscript`, `notes`, or the codex category of an entry.
class SearchBlock {
  const SearchBlock({
    required this.id,
    required this.entityType,
    required this.entityId,
    required this.entityTitle,
    required this.entityKind,
    required this.group,
    required this.field,
    required this.label,
    required this.index,
    required this.text,
  });

  /// `<entityId>:<field>:<index>`.
  final String id;
  final SearchEntityType entityType;
  final String entityId;
  final String entityTitle;

  /// A chapter's kind (`chapter`, `scene`…) or an entry's category.
  final String entityKind;
  final String group;
  final SearchField field;

  /// A field's name (`attribute`) or a plan field's (`plan`).
  final String label;

  /// Paragraph number for text; line or row otherwise.
  final int index;
  final String text;
}

List<String> _lines(String text) => text.split('\n');

/// Every searchable block of a chapter, scene or group: its title, the paragraphs and headings of its text, the lines
/// of its summary and notes, and its plan.
List<SearchBlock> nodeBlocks(StoryNode node, Object? doc, JsonMap? plan) {
  final blocks = <SearchBlock>[];
  void add(String group, SearchField field, int index, String text, [String label = '']) {
    if (text.trim().isEmpty) return;
    blocks.add(
      SearchBlock(
        id: '${node.id}:${field.name}:$index',
        entityType: SearchEntityType.node,
        entityId: node.id,
        entityTitle: node.title,
        entityKind: str(node.raw['kind']),
        group: group,
        field: field,
        label: label,
        index: index,
        text: text,
      ),
    );
  }

  add('manuscript', SearchField.title, 0, node.title);
  for (final (i, b) in docBlocks(doc).indexed) {
    add('manuscript', b.heading ? SearchField.heading : SearchField.body, i, b.text);
  }
  for (final (i, t) in _lines(node.summary).indexed) {
    add('notes', SearchField.summary, i, t);
  }
  for (final (i, t) in _lines(str(node.raw['notes'])).indexed) {
    add('notes', SearchField.notes, i, t);
  }
  if (plan != null) {
    for (final (i, f) in planTextFields.indexed) {
      add('notes', SearchField.plan, i, str(plan[f]), planLabels[f] ?? f);
    }
    for (final (i, beat) in maps(plan['beats']).indexed) {
      add('notes', SearchField.plan, 100 + i, str(beat['text']), 'Beat ${i + 1}');
    }
  }
  return blocks;
}

/// Every searchable block of a codex entry. Field values are indexed as a reader sees them (choices, linked entries'
/// names).
List<SearchBlock> entryBlocks(Entry entry, Category category, String? Function(String entryId) nameOf) {
  final blocks = <SearchBlock>[];
  void add(String group, SearchField field, int index, String text, [String label = '']) {
    if (text.trim().isEmpty) return;
    blocks.add(
      SearchBlock(
        id: '${entry.id}:${field.name}:$index',
        entityType: SearchEntityType.entry,
        entityId: entry.id,
        entityTitle: entry.name,
        entityKind: entry.category,
        group: group,
        field: field,
        label: label,
        index: index,
        text: text,
      ),
    );
  }

  add(entry.category, SearchField.name, 0, entry.name);
  for (final (i, t) in _lines(entry.summary).indexed) {
    add(entry.category, SearchField.summary, i, t);
  }
  for (final (i, t) in _lines(entry.description).indexed) {
    add(entry.category, SearchField.description, i, t);
  }
  add(entry.category, SearchField.tags, 0, strings(entry.raw['tags']).join(', '));
  for (final (i, f) in filledFields(entry, category, nameOf).indexed) {
    add(entry.category, SearchField.attribute, i, f.text, f.label);
  }
  for (final (i, t) in _lines(str(entry.raw['notes'])).indexed) {
    add('notes', SearchField.notes, i, t);
  }
  return blocks;
}

typedef SnippetPart = ({String text, bool hit});

class Snippet {
  const Snippet({
    required this.blockId,
    required this.field,
    required this.label,
    required this.index,
    required this.before,
    required this.parts,
    required this.after,
    required this.term,
  });
  final String blockId;
  final SearchField field;
  final String label;

  /// The block's position, for jumping to the exact paragraph.
  final int index;

  /// The tail of the paragraph before and the head of the one after, for context.
  final String before;
  final List<SnippetPart> parts;
  final String after;

  /// The matched words as written, to find them again at the destination.
  final String term;
}

class EntityResult {
  EntityResult({
    required this.entityType,
    required this.entityId,
    required this.title,
    required this.kind,
    required this.group,
  });
  final SearchEntityType entityType;
  final String entityId;
  final String title;
  final String kind;
  final String group;
  int matchCount = 0;
  List<Snippet> snippets = const [];
  int _score = 0;
  final _ranked = <({SearchBlock block, int score})>[];
}

typedef GroupResult = ({String group, int matchCount, List<EntityResult> items});

/// Built-in groups in their fixed order; the author's own categories follow them, before notes.
const groupOrder = ['manuscript', ...builtinCategoryKeys];
const minQueryLength = 2;

const _snippetsPerEntity = 3;
const _windowBefore = 110;
const _windowAfter = 190;
const _context = 140;

/// Where a match counts most when ranking.
const _fieldWeight = {
  SearchField.title: 100,
  SearchField.name: 100,
  SearchField.heading: 40,
  SearchField.tags: 30,
  SearchField.summary: 20,
  SearchField.attribute: 15,
  SearchField.description: 10,
  SearchField.body: 10,
  SearchField.notes: 10,
  SearchField.plan: 10,
};

/// The query's words, lower-cased, without repeats, at most twelve.
List<String> queryTerms(String query) => {
  for (final t in query.toLowerCase().split(RegExp(r'\s+')))
    if (t.isNotEmpty) t,
}.take(12).toList();

bool _inScope(String group, SearchScope scope) => switch (scope) {
  SearchScope.all => true,
  SearchScope.manuscript => group == 'manuscript',
  SearchScope.notes => group == 'notes',
  SearchScope.codex => group != 'manuscript' && group != 'notes',
};

/// Cuts at a word boundary and marks the cut with an ellipsis.
({String text, int offset}) _clip(String text, int start, int end) {
  var from = start < 0 ? 0 : start;
  var to = end > text.length ? text.length : end;
  if (from > 0) {
    final space = text.indexOf(' ', from);
    from = space != -1 && space < start + 30 ? space + 1 : from;
  }
  if (to < text.length) {
    final space = text.lastIndexOf(' ', to);
    to = space > end - 30 ? space : to;
  }
  if (to < from) to = from;
  return (
    text: '${from > 0 ? '…' : ''}${text.substring(from, to)}${to < text.length ? '…' : ''}',
    offset: from - (from > 0 ? 1 : 0),
  );
}

List<SnippetPart> _highlight(String text, RegExp pattern) {
  final parts = <SnippetPart>[];
  var last = 0;
  for (final m in pattern.allMatches(text)) {
    if (m.end == m.start) continue;
    if (m.start > last) parts.add((text: text.substring(last, m.start), hit: false));
    parts.add((text: m[0]!, hit: true));
    last = m.end;
  }
  if (last < text.length) parts.add((text: text.substring(last), hit: false));
  return parts;
}

/// An in-memory keyword index over a novel's blocks: one pass to build, a scan of lower-cased text per query.
class SearchIndex {
  SearchIndex(this.blocks) {
    for (final (i, b) in blocks.indexed) {
      _lower.add((b.label.isNotEmpty ? '${b.label} ${b.text}' : b.text).toLowerCase());
      _byId[b.id] = i;
      (_byEntity[b.entityId] ??= []).add(i);
    }
  }

  final List<SearchBlock> blocks;
  final _lower = <String>[];
  final _byEntity = <String, List<int>>{};
  final _byId = <String, int>{};

  int get size => blocks.length;

  String _neighbour(SearchBlock block, int delta) {
    if (block.field != SearchField.body && block.field != SearchField.heading) return '';
    // Blank paragraphs are not indexed, so look a little further for the nearest text.
    for (var step = 1; step <= 3; step++) {
      for (final field in const ['body', 'heading']) {
        final i = _byId['${block.entityId}:$field:${block.index + delta * step}'];
        if (i != null) return blocks[i].text;
      }
    }
    return '';
  }

  Snippet _snippet(SearchBlock block, RegExp pattern) {
    final shown = block.label.isNotEmpty ? '${block.label}: ${block.text}' : block.text;
    final first = pattern.firstMatch(shown)?.start ?? -1;
    final at = first < 0 ? 0 : first;
    final window = _clip(shown, at - _windowBefore, at + _windowAfter);
    final previous = _neighbour(block, -1);
    final next = _neighbour(block, 1);
    return Snippet(
      blockId: block.id,
      field: block.field,
      label: block.label,
      index: block.index,
      before: window.offset <= 0 && previous.isNotEmpty
          ? _clip(previous, previous.length - _context, previous.length).text
          : '',
      parts: _highlight(window.text, pattern),
      after: window.text.endsWith('…') || next.isEmpty ? '' : _clip(next, 0, _context).text,
      term: pattern.firstMatch(block.text)?[0] ?? '',
    );
  }

  /// The records that hold every word of [query] (within [scope]), grouped and ranked, each with its strongest
  /// passages in reading order.
  List<GroupResult> search(String query, SearchScope scope) {
    final terms = queryTerms(query);
    if (query.trim().length < minQueryLength || terms.isEmpty) return const [];
    final everyTerm = (1 << terms.length) - 1;
    final sorted = [...terms]..sort((a, b) => b.length.compareTo(a.length));
    final pattern = RegExp(sorted.map(RegExp.escape).join('|'), caseSensitive: false, unicode: true);
    final results = <String, EntityResult>{};
    final order = <String>[];

    for (final indexes in _byEntity.values) {
      // A record matches when every word of the query appears somewhere in it (within the chosen scope).
      var seen = 0;
      final hits = <({int i, int mask})>[];
      for (final i in indexes) {
        if (!_inScope(blocks[i].group, scope)) continue;
        var mask = 0;
        for (var t = 0; t < terms.length; t++) {
          if (_lower[i].contains(terms[t])) mask |= 1 << t;
        }
        if (mask != 0) hits.add((i: i, mask: mask));
        seen |= mask;
      }
      if (seen != everyTerm) continue;
      for (final (:i, :mask) in hits) {
        final block = blocks[i];
        final key = '${block.entityId}|${block.group}';
        final result = results[key] ??= () {
          order.add(key);
          return EntityResult(
            entityType: block.entityType,
            entityId: block.entityId,
            title: block.entityTitle,
            kind: block.entityKind,
            group: block.group,
          );
        }();
        final score = _fieldWeight[block.field]! + (mask == everyTerm ? 25 : 0);
        result.matchCount++;
        result._score = (result._score > score ? result._score : score) + 1;
        result._ranked.add((block: block, score: score));
      }
    }

    final ranked = [for (final k in order) results[k]!];
    _stableSort(ranked, (a, b) {
      final s = b._score.compareTo(a._score);
      return s != 0 ? s : localeCompare(a.title, b.title);
    });
    final groups = <String, ({int matchCount, List<EntityResult> items})>{};
    for (final result in ranked) {
      // The strongest passages, in reading order.
      final strongest = [...result._ranked];
      _stableSort(strongest, (a, b) {
        final s = b.score.compareTo(a.score);
        return s != 0 ? s : a.block.index.compareTo(b.block.index);
      });
      final kept = strongest.take(_snippetsPerEntity).toList();
      _stableSort(kept, (a, b) => a.block.index.compareTo(b.block.index));
      result.snippets = [for (final r in kept) _snippet(r.block, pattern)];
      final g = groups[result.group] ?? (matchCount: 0, items: <EntityResult>[]);
      g.items.add(result);
      groups[result.group] = (matchCount: g.matchCount + result.matchCount, items: g.items);
    }
    final custom = [
      for (final g in groups.keys)
        if (!groupOrder.contains(g) && g != 'notes') g,
    ]..sort();
    return [
      for (final g in [...groupOrder, ...custom, 'notes'])
        if (groups[g] case final found?) (group: g, matchCount: found.matchCount, items: found.items),
    ];
  }
}

/// JavaScript's sort is stable; Dart's List.sort is not guaranteed to be, so ties keep their order here too.
void _stableSort<T>(List<T> list, int Function(T a, T b) compare) {
  final indexed = [for (final (i, v) in list.indexed) (i, v)];
  indexed.sort((a, b) {
    final c = compare(a.$2, b.$2);
    return c != 0 ? c : a.$1.compareTo(b.$1);
  });
  for (final (i, e) in indexed.indexed) {
    list[i] = e.$2;
  }
}
