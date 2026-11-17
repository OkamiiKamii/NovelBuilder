// THE CHAPTERS, AT HAND (FEATURES.md #85): on a phone, every chapter and scene in reading order in a sheet over the
// page, numbered, with its length; the one open marked; Previous and Next at its head. A press opens that page (what is
// typed is saved first), without going back to the contents.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { plural } from '../../domain/desk/format';
import { displayTitle } from '../../domain/desk/pageAround';
import { isDocument, readingOrder, type StoryNode } from '../../domain/outline';
import { Sheet } from '../dialogs';
import { Icon, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';

/** The chapters and scenes in reading order, and each chapter's number. */
export function pagesOf(nodes: readonly StoryNode[]): { pages: StoryNode[]; numbers: Map<string, number> } {
  const pages = readingOrder(nodes)
    .map((e) => e.node)
    .filter((n) => isDocument(n.kind));
  const numbers = new Map<string, number>();
  let count = 0;
  for (const n of pages) if (n.kind === 'chapter') numbers.set(n.id, ++count);
  return { pages, numbers };
}

export function ChapterSwitcher({
  visible,
  nodes,
  currentId,
  onOpen,
  onClose,
}: {
  visible: boolean;
  nodes: readonly StoryNode[];
  currentId: string;
  onOpen: (nodeId: string) => void;
  onClose: () => void;
}) {
  const { pages, numbers } = pagesOf(nodes);
  const at = pages.findIndex((n) => n.id === currentId);
  const go = (n: StoryNode | undefined) => {
    onClose();
    if (n && n.id !== currentId) onOpen(n.id);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="The chapters">
      <View style={styles.steps}>
        <OutlineButton label="Previous" icon="chevron-left" onPress={() => go(pages[at - 1])} disabled={at <= 0} style={styles.flex} />
        <OutlineButton
          label="Next"
          icon="chevron-right"
          onPress={() => go(pages[at + 1])}
          disabled={at < 0 || at + 1 >= pages.length}
          style={styles.flex}
        />
      </View>
      {pages.map((n) => {
        const on = n.id === currentId;
        return (
          <Pressable
            key={n.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => go(n)}
            style={({ pressed }) => [styles.row, n.kind === 'scene' && styles.scene, on && styles.on, pressed && { backgroundColor: colors.elevated }]}
          >
            {n.kind === 'chapter' ? (
              <Text style={styles.number}>{numbers.get(n.id) ?? ''}</Text>
            ) : (
              <Icon name="subdirectory-arrow-right" size={18} color={colors.muted} />
            )}
            <Text style={[styles.title, on && { color: colors.gold }]} numberOfLines={2}>
              {displayTitle(n)}
            </Text>
            <Text style={styles.words}>{n.wordCount === 0 ? 'Not begun' : plural(n.wordCount, 'word')}</Text>
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  steps: { flexDirection: 'row', gap: space.md, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.sm, borderRadius: radius.field },
  scene: { paddingLeft: space.xl },
  on: { backgroundColor: '#3A2A08' },
  number: { width: 24, fontFamily: fonts.bookItalic, fontSize: 18, color: colors.gold, textAlign: 'center' },
  title: { flex: 1, fontFamily: fonts.book, fontSize: 16, color: colors.text },
  words: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
});
