// SETTINGS (FEATURES.md section 5, laid out as the owner's mock-up): the open novel, appearance, the writer's rank and
// how it is earned, restore points, the sample novel, saving, and the writer's data.

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackupService } from '../data/backupService';
import { shareTextFile } from '../data/files';
import { addSampleNovel, sampleNovelTitle } from '../data/sampleNovel';
import { openNovelSettingKey } from '../data/settingsStore';
import { xpPerChapterFinished, xpPerDayWritten } from '../domain/writerRank';
import { RankPanel, useWriterRank } from './frame';
import { Icon, type IconName, Muted, OutlineButton, Panel, SectionTitle } from './kit';
import { useLibrary, useLibraryRevision } from './LibraryContext';
import { formatDate } from './library/NovelCard';
import { SavePill } from './SavePill';
import { colors, fonts, radius, sizeClassOf, space } from './theme';
import { useToast } from './toast';

export function SettingsScreen() {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const phone = sizeClassOf(width) === 'compact';
  const rank = useWriterRank();

  const { open, points } = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return {
      open: typeof id === 'string' ? lib.library.novel(id) : null,
      points: lib.restorePoints.list(),
    };
    // revision: read again after every write.
  }, [lib, revision]);

  const fail = (e: unknown) => toast(`${e instanceof Error ? e.message : String(e)}. Nothing was changed.`, { error: true });

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: (phone ? 0 : insets.bottom) + space.xl,
        paddingHorizontal: phone ? space.md : space.xl,
      }}
    >
      <View style={styles.heading}>
        <Icon name="cog" size={28} />
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>
      </View>

      {open && (
        <Panel style={styles.block}>
          <SectionTitle icon="book-open-variant" title="This novel" />
          <Text style={styles.novel}>{open.title || 'Untitled novel'}</Text>
          <View style={styles.buttons}>
            <OutlineButton
              label="Save a backup"
              icon="content-save-outline"
              compact
              onPress={() =>
                shareTextFile(BackupService.fileNameFor(open.title), lib.backups.exportBackup(open.id)).catch(fail)
              }
            />
            <OutlineButton
              label="Close novel"
              icon="close"
              compact
              tone="muted"
              onPress={() => {
                lib.saves.saveNow(`setting:${openNovelSettingKey}`, () => lib.settings.write(openNovelSettingKey, null));
                router.navigate('/');
              }}
            />
          </View>
        </Panel>
      )}

      <Panel style={styles.block}>
        <SectionTitle icon="palette-outline" title="Appearance" />
        <Row icon="monitor-dashboard" label="Theme" value="System Monolith" note="A futuristic interface with a golden edge." />
        <Row icon="format-font" label="Font style" value="Outfit (UI) · Merriweather (Text)" />
        <Row icon="circle" iconColor={colors.gold} label="Accent colour" value="Gold (System)" valueColor={colors.gold} />
        <Muted style={styles.later}>More looks and writing preferences come with Write.</Muted>
      </Panel>

      <Panel style={styles.block}>
        <SectionTitle icon="crown" title="Your writer rank" />
        <View style={phone ? undefined : styles.rankRow}>
          <View style={phone ? undefined : styles.rankPanel}>
            <RankPanel />
          </View>
          <View style={styles.flex}>
            <Text style={styles.body}>
              {rank.wordsWritten.toLocaleString('en-US')} words written · {rank.daysWritten} days at the desk ·{' '}
              {rank.chaptersFinished} chapters finished · {rank.xp.toLocaleString('en-US')} XP
            </Text>
            <Muted style={styles.later}>
              Earned only by writing, in every novel on this phone: 1 XP for each word written, {xpPerDayWritten} XP for
              each day you write, {xpPerChapterFinished} XP for each chapter or scene marked Final or Published. Deleting
              words never costs XP. Ranks go F, E, D, C, B, A, S, SS, SSS.
            </Muted>
          </View>
        </View>
      </Panel>

      <Panel style={styles.block}>
        <SectionTitle icon="restore" title="Restore points" />
        <Muted>Copies kept on this phone before a novel is deleted, replaced or restored. The newest 20 of each novel.</Muted>
        {points.length === 0 ? (
          <Muted style={styles.later}>None yet.</Muted>
        ) : (
          points.map((p) => (
            <View key={p.id} style={styles.line}>
              <View style={styles.flex}>
                <Text style={styles.lineTitle} numberOfLines={1}>
                  {p.title || 'Untitled novel'}
                </Text>
                <Muted>
                  {p.reason} · {formatDate(p.createdAt)}
                </Muted>
              </View>
              <OutlineButton
                label="Restore"
                icon="restore"
                compact
                tone="sky"
                onPress={() => {
                  try {
                    lib.backups.restore(p.id);
                    toast(`Restored “${p.title}”. The version it replaced is kept as a restore point.`);
                  } catch (e) {
                    fail(e);
                  }
                }}
              />
            </View>
          ))
        )}
      </Panel>

      <Panel style={styles.block}>
        <SectionTitle icon="book-plus-outline" title="Sample novel" />
        <Muted>“{sampleNovelTitle}”: fifteen chapters with a cast, places, plot threads and a timeline to explore.</Muted>
        <OutlineButton
          label="Add the sample novel"
          icon="plus"
          compact
          style={styles.start}
          onPress={() => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const file: unknown = require('../../assets/sample/the-drowned-road.novel.json');
              addSampleNovel(lib.novels, file, Date.now(), lib.library.uniqueTitle(sampleNovelTitle));
              toast('The sample novel is in your library');
            } catch (e) {
              fail(e);
            }
          }}
        />
      </Panel>

      <Panel style={styles.block}>
        <SectionTitle icon="shield-lock-outline" title="Your data" />
        <Text style={styles.body}>
          No account, no cloud, no AI. Everything you write is kept in Scriptor’s own folder on this phone and is never
          sent anywhere. Backups go only where you choose to save them.
        </Text>
        <Text style={styles.label}>LIBRARY FILE</Text>
        <Text style={styles.path} selectable>
          {lib.db.location ?? 'In memory'}
        </Text>
        <Text style={styles.label}>SAVING</Text>
        <SavePill />
      </Panel>

      <Panel style={styles.block}>
        <SectionTitle icon="information-outline" title="About" />
        <Text style={styles.body}>Scriptor 0.1 · the React Native version of Novel Builder</Text>
        <Muted>Typefaces: Outfit, Merriweather, Cinzel and JetBrains Mono (SIL Open Font License).</Muted>
      </Panel>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  value,
  note,
  valueColor = colors.text,
  iconColor = colors.muted,
}: {
  icon: IconName;
  label: string;
  value: string;
  note?: string;
  valueColor?: string;
  iconColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={20} color={iconColor} />
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        {note && <Muted>{note}</Muted>}
      </View>
      <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.text },
  block: { marginTop: space.lg },
  novel: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  rowLabel: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  rowValue: { fontFamily: fonts.ui, fontSize: 14, maxWidth: '50%', textAlign: 'right' },
  later: { marginTop: space.sm },
  rankRow: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  rankPanel: { width: 220 },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  label: { marginTop: space.lg, marginBottom: 6, fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.4, color: colors.gold },
  path: { fontFamily: fonts.numbers, fontSize: 12, color: colors.muted },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  lineTitle: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  start: { alignSelf: 'flex-start', marginTop: space.md },
});
