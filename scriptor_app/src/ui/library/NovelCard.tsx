// A novel in the Library, as the owner's mock-up draws it: the cover with its status at the top left and a "…" menu at
// the top right, the title in Cinzel, how far it is, its chapters and when it was last opened, then Continue and its
// numbers. And the same novel as a row, for the list view.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { NovelStats } from '../../data/novelStore';
import { type Novel, novelStatusLabel } from '../../domain/novel';
import { progressOf } from '../../domain/libraryView';
import { Icon, type IconName, IconButton, OutlineButton, ProgressBar } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { NovelCover } from './NovelCover';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatDate(ms: number | null): string {
  return ms ? dateFormat.format(new Date(ms)) : 'Never';
}

function statusLook(novel: Novel): { label: string; color: string; icon: IconName } {
  if (novel.archived) return { label: 'Archived', color: colors.muted, icon: 'archive-outline' };
  switch (novel.status) {
    case 'complete':
      return { label: 'Completed', color: colors.success, icon: 'check-circle' };
    case 'on-hold':
      return { label: 'On Hold', color: colors.gold, icon: 'pause' };
    case 'planning':
      return { label: 'Planning', color: colors.sky, icon: 'lightbulb-on-outline' };
    default:
      return { label: novelStatusLabel(novel.status), color: colors.sky, icon: 'circle' };
  }
}

export function StatusChip({ novel }: { novel: Novel }) {
  const look = statusLook(novel);
  return (
    <View style={styles.status} accessible accessibilityLabel={`Status: ${look.label}`}>
      <Icon name={look.icon} size={look.icon === 'circle' ? 10 : 14} color={look.color} />
      <Text style={[styles.statusText, { color: look.color }]}>{look.label}</Text>
    </View>
  );
}

type CardProps = {
  novel: Novel;
  stats: NovelStats | undefined;
  width: number;
  onContinue: () => void;
  onMenu: () => void;
  onStats: () => void;
};

export function NovelCard({ novel, stats, width, onContinue, onMenu, onStats }: CardProps) {
  const words = stats?.words ?? 0;
  const progress = progressOf(novel, words);
  const coverHeight = Math.round(width * 0.95);
  const done = novel.status === 'complete';
  return (
    <View style={[styles.card, { width }, novel.pinned && styles.cardPinned]}>
      <View>
        <NovelCover novel={novel} height={coverHeight} showTitle={false} />
        <View style={styles.coverTop}>
          <StatusChip novel={novel} />
          <View style={styles.menuButton}>
            <IconButton icon="dots-horizontal" label={`More for ${novel.title}`} onPress={onMenu} size={20} />
          </View>
        </View>
        {novel.pinned && (
          <View style={styles.pin} accessible accessibilityLabel="Favorite">
            <Icon name="star" size={16} color={colors.gold} />
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.75}>
          {novel.title || 'Untitled novel'}
        </Text>
        {progress !== null ? <ProgressBar value={progress} /> : <Text style={styles.noTarget}>No word target</Text>}
        <View style={styles.metaRow}>
          <Icon name="book-open-outline" size={16} color={colors.muted} />
          <Text style={styles.meta}>
            {stats?.chapters ?? 0} {stats?.chapters === 1 ? 'Chapter' : 'Chapters'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Icon name="clock-outline" size={16} color={colors.muted} />
          <Text style={styles.meta}>
            {done ? 'Completed' : 'Last Read'}: {formatDate(done ? novel.updatedAt : novel.lastOpenedAt)}
          </Text>
        </View>
        <View style={styles.actions}>
          <OutlineButton
            label={done ? 'View' : 'Continue'}
            icon={done ? 'eye-outline' : 'play-circle-outline'}
            onPress={onContinue}
            compact
            style={styles.flex}
            accessibilityLabel={`${done ? 'View' : 'Continue'} ${novel.title}`}
          />
          <IconButton icon="chart-bar" label={`Numbers for ${novel.title}`} onPress={onStats} color={colors.gold} bordered />
        </View>
      </View>
    </View>
  );
}

export function NovelRow({ novel, stats, onContinue, onMenu }: Omit<CardProps, 'width' | 'onStats'>) {
  const words = stats?.words ?? 0;
  const progress = progressOf(novel, words);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Continue ${novel.title}`}
      onPress={onContinue}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }]}
    >
      <View style={styles.rowCover}>
        <NovelCover novel={novel} height={84} showTitle={false} />
      </View>
      <View style={styles.flex}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {novel.pinned ? '★ ' : ''}
            {novel.title || 'Untitled novel'}
          </Text>
        </View>
        <StatusChip novel={novel} />
        <Text style={styles.meta} numberOfLines={1}>
          {stats?.chapters ?? 0} chapters · {words.toLocaleString('en-US')} words · Last read {formatDate(novel.lastOpenedAt)}
        </Text>
        {progress !== null && <ProgressBar value={progress} />}
      </View>
      <IconButton icon="dots-vertical" label={`More for ${novel.title}`} onPress={onMenu} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: '#5A4618',
    backgroundColor: colors.surface,
    overflow: 'hidden',
    shadowColor: colors.sky,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  cardPinned: { borderColor: colors.gold },
  coverTop: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    right: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuButton: { backgroundColor: 'rgba(10, 11, 14, 0.7)', borderRadius: radius.field },
  pin: {
    position: 'absolute',
    bottom: space.sm,
    right: space.sm,
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(10, 11, 14, 0.7)',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(10, 11, 14, 0.8)',
  },
  statusText: { fontFamily: fonts.ui, fontSize: 13 },
  cardBody: { padding: space.md, gap: space.sm },
  cardTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, textAlign: 'center', color: colors.text, minHeight: 52 },
  noTarget: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowCover: { width: 60, borderRadius: 6, overflow: 'hidden' },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { flex: 1, fontFamily: fonts.display, fontSize: 17, color: colors.text },
});
