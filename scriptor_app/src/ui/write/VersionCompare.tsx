// An earlier version compared with the text now (FEATURES.md #117): paragraphs added, removed, changed (word by word)
// or moved, each marked with a sign and a style as well as a colour. Formatting-only changes are not shown.

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { plural } from '../../domain/desk/format';
import { diffDocs, type DiffBlock } from '../../domain/manuscript/diff';
import { colors, fonts, space } from '../theme';

export function VersionCompare({ before, after }: { before: unknown; after: unknown }) {
  const result = useMemo(() => diffDocs(before, after), [before, after]);
  const s = result.stats;
  return (
    <View>
      <Text style={styles.summary}>
        {result.identical
          ? 'The same text as now (formatting may differ).'
          : `+${s.wordsAdded} words, −${s.wordsRemoved} words, ${plural(s.paragraphsChanged, 'paragraph')} changed since this version`}
      </Text>
      <View style={styles.rule} />
      {result.blocks.map((b, i) => (
        <Paragraph key={i} block={b} />
      ))}
    </View>
  );
}

function Paragraph({ block }: { block: DiffBlock }) {
  const [sign, label] = {
    same: ['', ''],
    added: ['+', 'Added: '],
    removed: ['−', 'Removed: '],
    changed: ['~', 'Changed: '],
    moved: ['↕', 'Moved: '],
  }[block.kind];
  return (
    <View style={styles.para} accessible accessibilityLabel={`${label}${textOf(block)}`}>
      <Text style={styles.sign}>{sign}</Text>
      <Text style={[styles.text, block.kind === 'same' && styles.same]}>
        {block.kind === 'changed' ? (
          block.parts.map((p, i) => (
            <Text key={i} style={p.op === 'add' ? styles.added : p.op === 'del' ? styles.removed : undefined}>
              {p.text}
            </Text>
          ))
        ) : block.kind === 'added' ? (
          <Text style={styles.added}>{block.text}</Text>
        ) : block.kind === 'removed' ? (
          <Text style={styles.removed}>{block.text}</Text>
        ) : block.kind === 'moved' ? (
          `${block.side === 'to' ? 'Moved here: ' : 'Moved from here: '}${block.text}`
        ) : (
          block.text
        )}
      </Text>
    </View>
  );
}

function textOf(b: DiffBlock): string {
  return b.kind === 'changed' ? b.parts.filter((p) => p.op !== 'del').map((p) => p.text).join('') : b.text;
}

const styles = StyleSheet.create({
  summary: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
  para: { flexDirection: 'row', marginBottom: space.md },
  sign: { width: 20, fontFamily: fonts.book, fontSize: 16, lineHeight: 26, color: colors.gold },
  text: { flex: 1, fontFamily: fonts.book, fontSize: 16, lineHeight: 26, color: colors.text },
  same: { color: colors.muted },
  added: { color: colors.gold, textDecorationLine: 'underline' },
  removed: { color: colors.muted, textDecorationLine: 'line-through' },
});
