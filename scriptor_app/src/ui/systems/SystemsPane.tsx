// ORGANIZE › SYSTEMS (FEATURES.md #228–#229): the novel's own blueprints for how characters grow. With none yet, the
// GALLERY (./SystemGallery.tsx: your book's own system, a card for each preset with an example status window, and a
// blank one). With systems, each as a card (opening its page, ./SystemScreen.tsx) with its On | Off control; those
// turned off wait below under "Turned off", dimmed, and come back with On. "Add a system" opens the same gallery in a
// sheet at any time. The pure parts are src/domain/systems/screens/{gallery,systemsPage}.ts; a port of
// flutter_app/lib/features/progression/systems_page.dart (its gallery half).

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PageScroll } from '../pageScroll';

import { StoryModel } from '../../domain/model/storyModel';
import type { SystemBlueprint } from '../../domain/records/system';
import { galleryWords } from '../../domain/systems/screens/gallery';
import { systemsModeKey, systemsOf, systemsPath, systemsWords } from '../../domain/systems/screens/systemsPage';
import { GoldButton, Icon, Muted } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { AddSystemSheet, SystemGallery } from './SystemGallery';
import { SystemSwitch } from './SystemSwitch';
import { useSystems } from './useSystems';
import { LevelsView } from './PageReadings';

export function SystemsPane() {
  const sys = useSystems();
  const lib = useLibrary();
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const model = useMemo(() => (sys ? StoryModel.fromSnapshot(sys.snapshot) : null), [sys]);

  if (!sys || !model) return null;
  const { systems } = systemsOf(model, null);
  const on = systems.filter((s) => !s.off);
  const off = systems.filter((s) => s.off);

  /** Shows the system made: its blueprint (a new one is built in its rules first); begun from the pages, it already holds
   * the hero and what they can do, so it is shown in the story, their window first. */
  const made = (id: string, own: boolean) => {
    if (own) {
      lib.saves.saveNow(`setting:${systemsModeKey}`, () => {
        lib.settings.write(systemsModeKey, 'story');
        lib.novels.touchSettings();
      });
    }
    router.navigate(systemsPath(own ? { systemId: id } : { systemId: id, tab: 'variables' }) as never);
  };

  const card = (s: SystemBlueprint) => (
    <View key={s.id} style={styles.systemCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${s.name}`}
        onPress={() => router.navigate(systemsPath({ systemId: s.id }) as never)}
        style={({ pressed }) => [styles.open, s.off && styles.dim, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.circle}>
          <Icon name="family-tree" size={22} color={colors.onGold} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardName}>{s.name}</Text>
          {s.description.length > 0 && <Muted numberOfLines={2}>{s.description}</Muted>}
          <Muted>
            {[
              counted(s.variables.length, 'attribute or resource', 'attributes & resources'),
              counted(s.tracks.length, 'level or realm', 'levels & realms'),
              counted(model.sheets.filter((x) => x.systemId === s.id).length, 'sheet', 'sheets'),
            ].join(' · ')}
          </Muted>
        </View>
        <Icon name="chevron-right" size={22} color={colors.muted} />
      </Pressable>
      <SystemSwitch sys={sys} system={s} />
    </View>
  );

  return (
    <PageScroll contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {systems.length > 0 ? (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {systemsWords.title}
          </Text>
          {on.map(card)}
          <GoldButton label={systemsWords.addSystem} icon="plus" compact onPress={() => setChoosing(true)} style={styles.start} />
          {off.length > 0 && (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {systemsWords.turnedOff}
              </Text>
              <Muted>{systemsWords.turnedOffNote}</Muted>
              {off.map(card)}
            </>
          )}
        </>
      ) : (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {galleryWords.title}
          </Text>
          <Text style={styles.intro}>{galleryWords.intro}</Text>
          <SystemGallery sys={sys} model={model} onMade={made} />
          {/* Levels need no system: what the chapters give a level to is kept all the same (levels_view.dart). */}
          <LevelsView sys={sys} />
        </>
      )}
      {choosing && <AddSystemSheet sys={sys} model={model} onClose={() => setChoosing(false)} onMade={made} />}
    </PageScroll>
  );
}

/** "1 sheet", "3 sheets". */
function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  title: { fontFamily: fonts.display, fontSize: 18, fontWeight: '700', color: colors.text },
  intro: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 23, color: colors.muted },
  start: { alignSelf: 'flex-start' },
  circle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  cardName: { flexShrink: 1, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  systemCard: { gap: space.sm, padding: space.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  open: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dim: { opacity: 0.55 },
});
