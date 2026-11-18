// THE TUTORIAL (FEATURES.md #358–#360): a short lesson for each feature, opened on the lesson for the page in view; Next
// and Back walk through; All topics lists them in their groups with "Find a lesson"; "Take me there" goes to a lesson's
// page; Your path ticks the lessons your books show you have used and names the next; on the lesson for this page,
// "Show me on this page" dims the page and lights each button the lesson names (Spotlight). It only explains: nothing
// in it changes a novel. A port of flutter_app/lib/features/tutorial/tutorial.dart, in Scriptor's words
// (scriptorLessons.ts).

import { usePathname } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openNovelSettingKey } from '../../data/settingsStore';
import { flutterPathOf, scriptorPlace } from '../../domain/search/places';
import { scriptorOnlyLesson, scriptorTopics } from '../../domain/tutorial/scriptorLessons';
import { type Topic, topicFor } from '../../domain/tutorial/topics';
import { tutorialGroups } from '../../domain/tutorial/topicsData';
import { scriptorNamesIn, scriptorTourOf } from '../../domain/tutorial/tour';
import { yourPath, type YourPath } from '../../domain/tutorial/yourPath';
import { GoldButton, Icon, IconButton, Muted, OutlineButton } from '../kit';
import { useLibrary } from '../LibraryContext';
import { useGoTo, showing } from '../search/goTo';
import { closeTutorial, startTour, useShown } from '../search/opener';
import { colors, fonts, radius, space } from '../theme';
import { findOnScreen } from './spots';
import { Spotlight } from './Spotlight';

/** Whether the Tutorial button is showing: a preference of this device, not of a novel. */
export const tutorialShownKey = 'tutorial.shown';

/** The lesson for where someone is: Scriptor's page and the tab showing there, read as the Flutter app's path. */
export function lessonHere(pathname: string): Topic {
  const path = flutterPathOf(pathname, showing());
  const only = scriptorOnlyLesson(path);
  if (only !== null) return scriptorTopics.find((t) => t.id === only) ?? topicFor(path, scriptorTopics);
  return topicFor(path, scriptorTopics);
}

/** Held by the app frame: the tutorial when it is open, and the tour when one is under way. */
export function TutorialHost() {
  const { tutorial, tour } = useShown();
  const pathname = usePathname();
  const [here, setHere] = useState<Topic | null>(null);
  // The lesson for this page, read as the tutorial opens (and kept for its tour).
  useEffect(() => {
    if (tutorial) setHere(lessonHere(pathname));
  }, [tutorial]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {tutorial && here !== null && <Tutorial here={here} />}
      {tour && here !== null && <SpotlightHost topic={here} />}
    </>
  );
}

function Tutorial({ here }: { here: Topic }) {
  const lib = useLibrary();
  const goTo = useGoTo();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(() => Math.max(0, scriptorTopics.indexOf(here)));
  const [listing, setListing] = useState(false);
  const [find, setFind] = useState('');
  const [pointable, setPointable] = useState(false);
  const [shown, setShownSetting] = useState(() => lib.settings.read(tutorialShownKey) !== false);
  const novelOpen = typeof lib.settings.read(openNovelSettingKey) === 'string';

  // What the library shows has been tried, read once as the tutorial opens (yourPath.ts).
  const path = useMemo<YourPath>(
    () =>
      yourPath(
        {
          count: (id, c) => lib.novels.countIn(id, c),
          rows: (id, c) => lib.novels.rowsIn(id, c),
          setting: (key) => lib.settings.read(key),
        },
        lib.novels.listNovels().map((n) => n.id),
        scriptorTopics,
      ),
    [lib],
  );
  // Whether the page under the tutorial shows any button the lesson for it names (read before it covers the page).
  useEffect(() => {
    let live = true;
    void findOnScreen(tourNames(here)).then((at) => {
      if (live) setPointable(scriptorTourOf(here.steps, at).length > 0);
    });
    return () => {
      live = false;
    };
  }, [here]);

  const topic = scriptorTopics[index];
  const last = index === scriptorTopics.length - 1;
  const show = (t: Topic) => {
    setIndex(scriptorTopics.indexOf(t));
    setListing(false);
  };
  const setShown = (v: boolean) => {
    setShownSetting(v);
    lib.saves.saveNow(`setting:${tutorialShownKey}`, () => {
      lib.settings.write(tutorialShownKey, v);
      lib.novels.touchSettings();
    });
  };
  const place = topic.path !== undefined ? scriptorPlace(topic.path) : null;
  const needsNovel = topic.path !== undefined && topic.path !== '/' && !topic.path.startsWith('/settings');

  const words = find.trim().toLowerCase();
  const fits = (t: Topic) => words.length === 0 || [t.title, t.what, ...t.steps, t.where ?? ''].join(' ').toLowerCase().includes(words);
  const found = scriptorTopics.filter(fits);
  const counted = path.counted.filter((id) => path.tried.has(id)).length;

  return (
    <Modal visible animationType="slide" onRequestClose={closeTutorial} statusBarTranslucent>
      <View style={[styles.page, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom }]} accessibilityLabel="Tutorial" accessibilityViewIsModal>
        <View style={styles.head}>
          <View style={styles.headWords}>
            <Text style={styles.headTitle}>Tutorial</Text>
            <Muted>{`Lesson ${index + 1} of ${scriptorTopics.length}`}</Muted>
            <Pressable accessibilityRole="button" onPress={() => setListing(!listing)} style={styles.link}>
              <Text style={styles.linkText}>{listing ? 'Back to the lesson' : 'All topics'}</Text>
            </Pressable>
          </View>
          <IconButton icon="close" label="Close the tutorial" onPress={closeTutorial} color={colors.muted} />
        </View>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${((index + 1) / scriptorTopics.length) * 100}%` }]} />
        </View>
        {listing ? (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.pathCard}>
              <Text style={styles.pathTitle}>Your path</Text>
              <Muted>{`${counted} of ${path.counted.length} lessons tried in your books`}</Muted>
              {path.next !== null ? (
                <View style={styles.row}>
                  <Text style={[styles.body16, styles.flex]}>{`Next: ${path.next.title}`}</Text>
                  <GoldButton label="Show me" compact onPress={() => show(path.next!)} />
                </View>
              ) : (
                <Muted>Every lesson your books can show is ticked.</Muted>
              )}
            </View>
            <View style={styles.find}>
              <Icon name="magnify" size={20} color={colors.muted} />
              <TextInput
                value={find}
                onChangeText={setFind}
                placeholder="sprint, backup, canon…"
                placeholderTextColor={colors.muted}
                selectionColor={colors.gold}
                style={styles.findInput}
                accessibilityLabel="Find a lesson"
              />
            </View>
            {found.length === 0 && <Muted>{`No lesson mentions “${find.trim()}”.`}</Muted>}
            {tutorialGroups.map((group) =>
              found.some((t) => t.group === group) ? (
                <View key={group}>
                  <Text style={styles.group} accessibilityRole="header">
                    {group.toUpperCase()}
                  </Text>
                  {found
                    .filter((t) => t.group === group)
                    .map((t) => (
                      <Pressable
                        key={t.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: t === topic }}
                        onPress={() => show(t)}
                        style={({ pressed }) => [styles.topicRow, pressed && { backgroundColor: colors.elevated }]}
                      >
                        <Text style={[styles.topicTitle, t === topic && { color: colors.gold }]}>{t.title}</Text>
                        {t === here && <Text style={styles.here}>This page</Text>}
                        {path.tried.has(t.id) ? (
                          <Icon name="check-circle" size={20} color={colors.gold} />
                        ) : path.next === t ? (
                          <Icon name="flag-outline" size={20} color={colors.gold} />
                        ) : null}
                      </Pressable>
                    ))}
                </View>
              ) : null,
            )}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.group}>{topic.group.toUpperCase()}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {topic.title}
            </Text>
            {path.tried.has(topic.id) ? (
              <View style={styles.mark}>
                <Icon name="check-circle" size={18} color={colors.gold} />
                <Text style={styles.markText}>You have tried this already</Text>
              </View>
            ) : path.next === topic ? (
              <View style={styles.mark}>
                <Icon name="flag-outline" size={18} color={colors.gold} />
                <Text style={styles.markText}>Next on your path</Text>
              </View>
            ) : null}
            <Text style={styles.what}>{topic.what}</Text>
            {topic === here && pointable && (
              <GoldButton label="Show me on this page" icon="target" onPress={startTour} style={styles.start} />
            )}
            <View style={styles.rule} />
            <Text style={styles.subhead} accessibilityRole="header">
              How to use it
            </Text>
            {topic.steps.map((step, i) => (
              <View key={i} style={styles.step} accessible accessibilityLabel={`Step ${i + 1}. ${step}`}>
                <View style={styles.ring}>
                  <Text style={styles.ringText}>{i + 1}</Text>
                </View>
                <Text style={[styles.body16, styles.flex]}>{step}</Text>
              </View>
            ))}
            <View style={styles.example}>
              <Text style={styles.subhead}>Example</Text>
              <Text style={styles.exampleText}>{topic.example}</Text>
            </View>
            {topic.where !== undefined && (
              <View style={styles.row}>
                <Icon name="map-marker-outline" size={18} color={colors.muted} />
                <Muted style={styles.flex}>{`Where: ${topic.where}`}</Muted>
              </View>
            )}
            {place !== null && topic !== here &&
              (needsNovel && !novelOpen ? (
                <Muted>Open a novel to try this.</Muted>
              ) : (
                <OutlineButton
                  label="Take me there"
                  icon="arrow-right"
                  compact
                  onPress={() => {
                    closeTutorial();
                    goTo(place);
                  }}
                  style={styles.start}
                />
              ))}
          </ScrollView>
        )}
        <View style={styles.foot}>
          <View style={styles.row}>
            <OutlineButton label="← Back" compact disabled={index === 0} onPress={() => show(scriptorTopics[index - 1])} />
            <View style={styles.flex} />
            <GoldButton
              label="Next →"
              compact
              disabled={last}
              accessibilityLabel={last ? 'Next' : `Next: ${scriptorTopics[index + 1].title}`}
              onPress={() => show(scriptorTopics[index + 1])}
            />
          </View>
          {!last && !listing && <Muted style={styles.nextLine}>{`Next: ${scriptorTopics[index + 1].title}`}</Muted>}
          <View style={styles.row}>
            <Text style={[styles.body14, styles.flex]}>Show the Tutorial button</Text>
            <Switch
              value={shown}
              onValueChange={setShown}
              trackColor={{ true: colors.gold, false: colors.border }}
              thumbColor={colors.text}
              accessibilityLabel="Show the Tutorial button"
            />
          </View>
          {!shown && <Muted>The button is gone from the top of the areas. Open the tutorial from search (type “tutorial”), or switch it back on here.</Muted>}
        </View>
      </View>
    </Modal>
  );
}

/** Every button name a lesson's steps mention, for the tour to look for. */
export function tourNames(t: Topic): string[] {
  return [...new Set(scriptorNamesIn(t.steps).flat())];
}

function SpotlightHost({ topic }: { topic: Topic }) {
  return <Spotlight topic={topic} names={tourNames(topic)} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.md },
  headWords: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  headTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.gold },
  link: { minHeight: 40, justifyContent: 'center', paddingHorizontal: space.xs },
  linkText: { fontFamily: fonts.ui, fontSize: 14, color: colors.sky },
  track: { height: 3, backgroundColor: 'rgba(243, 182, 58, 0.15)', marginTop: space.xs },
  trackFill: { height: 3, backgroundColor: colors.gold },
  body: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  group: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.muted, marginTop: space.sm },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  what: { fontFamily: fonts.bookItalic, fontSize: 17, lineHeight: 25, color: colors.text },
  mark: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  markText: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold },
  start: { alignSelf: 'flex-start' },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: space.sm },
  subhead: { fontFamily: fonts.display, fontSize: 15, color: colors.gold },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginTop: space.xs },
  ring: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.gold },
  body16: { fontFamily: fonts.book, fontSize: 16, lineHeight: 24, color: colors.text },
  body14: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  example: { marginTop: space.md, padding: space.md, gap: space.xs, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  exampleText: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 24, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  foot: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.xs },
  nextLine: { textAlign: 'right' },
  pathCard: { padding: space.md, gap: space.xs, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.surface },
  pathTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.gold },
  find: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  findInput: { flex: 1, fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.field },
  topicTitle: { flex: 1, fontFamily: fonts.book, fontSize: 16, color: colors.text },
  here: { fontFamily: fonts.ui, fontSize: 12, color: colors.sky },
});
