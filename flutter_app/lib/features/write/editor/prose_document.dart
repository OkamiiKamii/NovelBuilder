import 'package:flutter/foundation.dart';
import 'package:super_editor/super_editor.dart';

import '../../../shared/domain/ids.dart';
import '../../../shared/domain/json.dart';

/// THE MANUSCRIPT FORMAT STAYS AS IT IS.
///
/// Chapter text is stored as ProseMirror JSON, the original app's format. This file converts it to the editor's
/// document and back. A chapter is only opened for editing when converting it to the editor and straight back gives
/// the same document ([editableDocument]); anything that would not survive the trip opens read-only instead, so no
/// formatting is ever lost by opening and saving.
///
/// Mapping:
///  paragraph, heading 1–3     → ParagraphNode (blockType paragraph / header1–3), `textAlign` metadata
///  blockquote > paragraph(s)  → one blockquote ParagraphNode per paragraph, grouped back by `pm.group`
///  bullet/ordered list items  → ListItemNode with indent for nesting, grouped back by `pm.group`
///  horizontalRule             → HorizontalRuleNode
///  hardBreak                  → "\n" inside the text
///  bold, italic, underline, strike → the editor's attributions; entityLink → [EntityLinkAttribution]
///  any other mark             → [PreservedMarkAttribution], kept on its text and written back as it was
///  attributes beyond these    → kept in metadata and written back

/// A link from text to a codex entry, by the entry's permanent id.
@immutable
class EntityLinkAttribution implements Attribution {
  const EntityLinkAttribution(this.entryId);
  final String entryId;

  @override
  String get id => 'entityLink';

  @override
  bool canMergeWith(Attribution other) => other == this;

  @override
  bool operator ==(Object other) => other is EntityLinkAttribution && other.entryId == entryId;

  @override
  int get hashCode => entryId.hashCode;

  @override
  String toString() => 'EntityLinkAttribution($entryId)';
}

/// A mark this editor has no button for (from a newer app, or a feature not built yet): kept on its text, exactly.
@immutable
class PreservedMarkAttribution implements Attribution {
  PreservedMarkAttribution(JsonMap mark) : mark = freezeMap(mark), _key = _canonical(mark);
  final JsonMap mark;
  final String _key;

  static String _canonical(Object? v) => switch (v) {
    final Map<Object?, Object?> m =>
      '{${(m.keys.map((k) => '$k').toList()..sort()).map((k) => '$k:${_canonical(m[k])}').join(',')}}',
    final List<Object?> l => '[${l.map(_canonical).join(',')}]',
    _ => '$v',
  };

  @override
  String get id => 'pm:${mark['type']}';

  @override
  bool canMergeWith(Attribution other) => other == this;

  @override
  bool operator ==(Object other) => other is PreservedMarkAttribution && other._key == _key;

  @override
  int get hashCode => _key.hashCode;
}

const _known = {
  'bold': boldAttribution,
  'italic': italicsAttribution,
  'underline': underlineAttribution,
  'strike': strikethroughAttribution,
};

/// The order the original editor writes marks in (its schema's order). Marks it did not know come after, by type.
const _markOrder = ['bold', 'italic', 'strike', 'underline', 'entityLink'];

const _attrsKey = 'pm.attrs';
const _hasAttrsKey = 'pm.hasAttrs';
const _groupKey = 'pm.group';
const _listAttrsKey = 'pm.listAttrs';
const _itemAttrsKey = 'pm.itemAttrs';
const _quoteAttrsKey = 'pm.quoteAttrs';

class _Unsupported implements Exception {
  _Unsupported(this.reason);
  final String reason;
}

/// A chapter opened for editing, or the reason it cannot be.
class EditableProse {
  EditableProse._(this.document, this.docExtras, this.reason);

  /// The editor's document, or null when the chapter opens read-only.
  final MutableDocument? document;

  /// Keys of the stored document besides `type` and `content`, written back unchanged.
  final JsonMap docExtras;

  /// Why the chapter opens read-only, in words.
  final String? reason;

  bool get editable => document != null;
}

/// Opens a stored document for editing if it converts both ways exactly; otherwise says why not.
EditableProse editableDocument(JsonMap? stored, {String Function() createId = newId}) {
  final doc = stored ?? const {'type': 'doc'};
  final extras = {
    for (final e in doc.entries)
      if (e.key != 'type' && e.key != 'content') e.key: e.value,
  };
  try {
    final document = proseToDocument(doc, createId: createId);
    final back = documentToProse(document, extras: extras);
    if (!jsonEquals(normalizeProse(back), normalizeProse(doc))) {
      return EditableProse._(null, extras, 'This chapter has formatting the editor cannot reproduce exactly yet.');
    }
    return EditableProse._(document, extras, null);
  } on _Unsupported catch (e) {
    return EditableProse._(null, extras, e.reason);
  }
}

/// The editor's document for a stored ProseMirror document. Throws when it holds something not supported.
MutableDocument proseToDocument(JsonMap doc, {String Function() createId = newId}) {
  final nodes = <DocumentNode>[];
  var group = 0;

  JsonMap? attrsOf(JsonMap node) => mapOrNull(node['attrs']);

  AttributedText inline(Object? content) {
    final buffer = StringBuffer();
    final runs = <(int, int, List<JsonMap>)>[];
    for (final n in maps(content)) {
      switch (n['type']) {
        case 'text':
          final text = str(n['text']);
          if (text.isEmpty) continue;
          final start = buffer.length;
          buffer.write(text);
          runs.add((start, buffer.length, maps(n['marks'])));
        case 'hardBreak':
          if (n.keys.any((k) => k != 'type')) throw _Unsupported('A line break with formatting of its own.');
          buffer.write('\n');
        default:
          throw _Unsupported('Text with an inline “${n['type']}”.');
      }
    }
    final text = AttributedText(buffer.toString());
    for (final (start, end, marks) in runs) {
      for (final mark in marks) {
        final type = mark['type'];
        final Attribution attribution;
        if (_known.containsKey(type) && mark.keys.every((k) => k == 'type')) {
          attribution = _known[type]!;
        } else if (type == 'entityLink' &&
            mark.keys.every((k) => k == 'type' || k == 'attrs') &&
            attrsOf(mark)?.keys.every((k) => k == 'entryId') == true &&
            attrsOf(mark)?['entryId'] is String) {
          attribution = EntityLinkAttribution(attrsOf(mark)!['entryId']! as String);
        } else {
          attribution = PreservedMarkAttribution(mark);
        }
        text.addAttribution(attribution, SpanRange(start, end - 1));
      }
    }
    return text;
  }

  Map<String, dynamic> textMeta(JsonMap block) {
    final attrs = attrsOf(block) ?? const {};
    return {
      _attrsKey: {...attrs},
      _hasAttrsKey: block.containsKey('attrs'),
      if (attrs['textAlign'] is String) 'textAlign': attrs['textAlign'],
    };
  }

  void addList(JsonMap list, int indent) {
    final ordered = list['type'] == 'orderedList';
    final id = 'l${group++}';
    for (final item in maps(list['content'])) {
      final children = maps(item['content']);
      if (item['type'] != 'listItem' || children.isEmpty || children.first['type'] != 'paragraph') {
        throw _Unsupported('A list item that does not start with a paragraph.');
      }
      final para = children.first;
      final meta = {...textMeta(para), _groupKey: id, _listAttrsKey: attrsOf(list), _itemAttrsKey: attrsOf(item)};
      final text = inline(para['content']);
      nodes.add(
        ordered
            ? ListItemNode.ordered(id: createId(), text: text, indent: indent, metadata: meta)
            : ListItemNode.unordered(id: createId(), text: text, indent: indent, metadata: meta),
      );
      for (final nested in children.skip(1)) {
        if (nested['type'] != 'bulletList' && nested['type'] != 'orderedList') {
          throw _Unsupported('A list item with more than one paragraph.');
        }
        addList(nested, indent + 1);
      }
    }
  }

  void addBlock(JsonMap block, {Map<String, dynamic> extra = const {}}) {
    switch (block['type']) {
      case 'paragraph':
        nodes.add(
          ParagraphNode(id: createId(), text: inline(block['content']), metadata: {...textMeta(block), ...extra}),
        );
      case 'heading':
        final level = intOrNull(attrsOf(block)?['level']) ?? 1;
        if (level < 1 || level > 3) throw _Unsupported('A level $level heading.');
        nodes.add(
          ParagraphNode(
            id: createId(),
            text: inline(block['content']),
            metadata: {
              ...textMeta(block),
              'blockType': [header1Attribution, header2Attribution, header3Attribution][level - 1],
              ...extra,
            },
          ),
        );
      case 'horizontalRule':
        if (block.keys.any((k) => k != 'type')) throw _Unsupported('A divider with settings of its own.');
        nodes.add(HorizontalRuleNode(id: createId()));
      case 'blockquote':
        final id = 'q${group++}';
        final children = maps(block['content']);
        if (children.isEmpty || children.any((c) => c['type'] != 'paragraph')) {
          throw _Unsupported('A quotation holding something other than paragraphs.');
        }
        for (final c in children) {
          nodes.add(
            ParagraphNode(
              id: createId(),
              text: inline(c['content']),
              metadata: {
                ...textMeta(c),
                'blockType': blockquoteAttribution,
                _groupKey: id,
                _quoteAttrsKey: attrsOf(block),
              },
            ),
          );
        }
      case 'bulletList' || 'orderedList':
        addList(block, 0);
      default:
        throw _Unsupported('A “${block['type']}” block.');
    }
  }

  final content = maps(doc['content']);
  for (final block in content) {
    addBlock(block);
  }
  if (nodes.isEmpty) nodes.add(ParagraphNode(id: createId(), text: AttributedText()));
  return MutableDocument(nodes: nodes);
}

/// The stored ProseMirror document for the editor's document.
JsonMap documentToProse(Document document, {JsonMap extras = const {}}) {
  List<JsonMap> inline(AttributedText text) {
    final s = text.toPlainText();
    if (s.isEmpty) return const [];
    final out = <JsonMap>[];
    for (final span in text.spans.collapseSpans(contentLength: s.length)) {
      final piece = s.substring(span.start, span.end + 1);
      final marks = <(String, JsonMap)>[];
      for (final a in span.attributions) {
        switch (a) {
          case EntityLinkAttribution(:final entryId):
            marks.add((
              'entityLink',
              {
                'type': 'entityLink',
                'attrs': {'entryId': entryId},
              },
            ));
          case PreservedMarkAttribution(:final mark):
            marks.add((str(mark['type']), deepCopy(mark)! as JsonMap));
          default:
            for (final e in _known.entries) {
              if (e.value == a) marks.add((e.key, {'type': e.key}));
            }
        }
      }
      marks.sort((a, b) {
        int rank(String t) => _markOrder.contains(t) ? _markOrder.indexOf(t) : _markOrder.length;
        final r = rank(a.$1).compareTo(rank(b.$1));
        return r != 0 ? r : a.$1.compareTo(b.$1);
      });
      // Line breaks inside a paragraph are their own nodes.
      final lines = piece.split('\n');
      for (final (i, line) in lines.indexed) {
        if (i > 0) out.add({'type': 'hardBreak'});
        if (line.isEmpty) continue;
        final node = <String, Object?>{
          'type': 'text',
          'text': line,
          if (marks.isNotEmpty) 'marks': [for (final m in marks) m.$2],
        };
        // Neighbouring text with the same marks is one node, as ProseMirror keeps it.
        if (out.isNotEmpty && out.last['type'] == 'text' && jsonEquals(out.last['marks'], node['marks'])) {
          out.last['text'] = '${out.last['text']}$line';
        } else {
          out.add(node);
        }
      }
    }
    return out;
  }

  /// The block's attributes: the stored ones, with alignment and heading level as they are now. A block stored
  /// without attributes stays without them unless it gained some; a new block gets the original editor's defaults.
  JsonMap? attrsFor(TextNode node, {int? level}) {
    final stored = mapOrNull(node.getMetadataValue(_attrsKey));
    final align = node.getMetadataValue('textAlign');
    final attrs = <String, Object?>{...?stored, 'textAlign': align is String ? align : null, 'level': ?level}
      ..removeWhere((k, v) => k == 'level' && level == null);
    final hadNone = node.getMetadataValue(_hasAttrsKey) == false;
    if (hadNone && attrs.entries.every((e) => e.value == null)) return null;
    return attrs;
  }

  JsonMap textBlock(String type, TextNode node, {int? level}) {
    final content = inline(node.text);
    return {'type': type, 'attrs': ?attrsFor(node, level: level), if (content.isNotEmpty) 'content': content};
  }

  final blocks = <JsonMap>[];
  final nodes = document.toList();
  var i = 0;
  while (i < nodes.length) {
    final node = nodes[i];
    if (node is HorizontalRuleNode) {
      blocks.add({'type': 'horizontalRule'});
      i++;
    } else if (node is ListItemNode) {
      final run = <ListItemNode>[];
      while (i < nodes.length && nodes[i] is ListItemNode) {
        run.add(nodes[i] as ListItemNode);
        i++;
      }
      blocks.addAll(_lists(run, inline, attrsFor));
    } else if (node is ParagraphNode) {
      final blockType = node.getMetadataValue('blockType');
      if (blockType == blockquoteAttribution) {
        final group = node.getMetadataValue(_groupKey);
        final quoteAttrs = mapOrNull(node.getMetadataValue(_quoteAttrsKey));
        final paragraphs = <JsonMap>[];
        while (i < nodes.length) {
          final n = nodes[i];
          if (n is! ParagraphNode || n.getMetadataValue('blockType') != blockquoteAttribution) break;
          final g = n.getMetadataValue(_groupKey);
          // A new quotation starts where the stored grouping says one did; a quote line added while editing joins
          // the quotation before it.
          if (paragraphs.isNotEmpty && g != null && group != null && g != group) break;
          paragraphs.add(textBlock('paragraph', n));
          i++;
        }
        blocks.add({'type': 'blockquote', 'attrs': ?quoteAttrs, 'content': paragraphs});
      } else {
        final level = switch (blockType) {
          header1Attribution => 1,
          header2Attribution => 2,
          header3Attribution => 3,
          _ => null,
        };
        blocks.add(level == null ? textBlock('paragraph', node) : textBlock('heading', node, level: level));
        i++;
      }
    } else {
      i++; // Nothing else can be created by this editor.
    }
  }
  return {...deepCopy(extras)! as JsonMap, 'type': 'doc', 'content': blocks};
}

/// Rebuilds nested lists from a run of list items (indent = nesting depth, group = which stored list).
List<JsonMap> _lists(
  List<ListItemNode> items,
  List<JsonMap> Function(AttributedText) inline,
  JsonMap? Function(TextNode, {int? level}) attrsFor,
) {
  var i = 0;
  List<JsonMap> build(int depth) {
    final lists = <JsonMap>[];
    JsonMap? current;
    Object? currentGroup;
    while (i < items.length && items[i].indent >= depth) {
      final item = items[i];
      if (item.indent > depth) {
        // Deeper than any item before it at this depth: it belongs inside the previous item.
        final parent = current == null ? null : maps(current['content']).lastOrNull;
        final nested = build(depth + 1);
        if (parent != null) {
          (parent['content']! as List).addAll(nested);
        } else {
          lists.addAll(nested);
        }
        continue;
      }
      final type = item.type == ListItemType.ordered ? 'orderedList' : 'bulletList';
      final group = item.getMetadataValue(_groupKey);
      if (current == null ||
          current['type'] != type ||
          (group != null && currentGroup != null && group != currentGroup)) {
        current = {'type': type, 'attrs': ?mapOrNull(item.getMetadataValue(_listAttrsKey)), 'content': <JsonMap>[]};
        currentGroup = group;
        lists.add(current);
      }
      final paragraphContent = inline(item.text);
      (current['content']! as List).add({
        'type': 'listItem',
        'attrs': ?mapOrNull(item.getMetadataValue(_itemAttrsKey)),
        'content': <JsonMap>[
          {'type': 'paragraph', 'attrs': ?attrsFor(item), if (paragraphContent.isNotEmpty) 'content': paragraphContent},
        ],
      });
      i++;
    }
    return lists;
  }

  return build(0);
}

/// A document in the form two documents can be compared in: marks in a fixed order, empty lists and an empty
/// document's single empty paragraph treated as the same. Used only to compare, never to save.
JsonMap normalizeProse(JsonMap doc) {
  Object? walk(Object? v) {
    switch (v) {
      case final Map<Object?, Object?> m:
        final out = <String, Object?>{};
        for (final e in m.entries) {
          final key = '${e.key}';
          var value = walk(e.value);
          if (key == 'marks' && value is List) {
            final sorted = [...value]
              ..sort((a, b) {
                String t(Object? x) => str(mapOrNull(x)?['type']);
                int rank(String type) => _markOrder.contains(type) ? _markOrder.indexOf(type) : _markOrder.length;
                final r = rank(t(a)).compareTo(rank(t(b)));
                return r != 0 ? r : t(a).compareTo(t(b));
              });
            value = sorted;
          }
          if ((key == 'marks' || key == 'content') && value is List && value.isEmpty) continue;
          out[key] = value;
        }
        return out;
      case final List<Object?> l:
        return [for (final x in l) walk(x)];
      default:
        return v;
    }
  }

  final out = walk(doc)! as JsonMap;
  final content = listOf(out['content']);
  if (content.isEmpty) {
    out['content'] = [
      {
        'type': 'paragraph',
        'attrs': {'textAlign': null},
      },
    ];
  }
  return out;
}
