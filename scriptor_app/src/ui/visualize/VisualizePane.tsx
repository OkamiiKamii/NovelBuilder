// VISUALIZE (Organize › Visualize, FEATURES.md #274): the atlas of views as plates, gathered by subject (People, Time,
// The story, The world, Numbers); views the novel turned off are left out, and "Turn views on or off" brings them back.
// A plate opens its view's page (/visualize/<view>, the relationship map at Organize's). A port of the Flutter app's
// Visualize area page and view_atlas.dart.

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';

import { isViewOn, turnOff, turnOn } from '../../domain/visualize/modules';
import { atlasOf, atlasWords, manageWords, offeredViews, viewsOffOf } from '../../domain/visualize/screens/frame';
import { isBuilt, viewLabel, visualViews } from '../../domain/visualize/views';
import { VisualizeService } from '../../domain/visualize/visualizeService';
import { Sheet } from '../dialogs';
import { GoldButton, Muted, OutlineButton } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { useCast } from '../organize/useCast';
import { Plate } from './VizFrame';

export function VisualizePane() {
  const router = useRouter();
  const lib = useLibrary();
  const toast = useToast();
  const open = useCast();
  const { width } = useWindowDimensions();
  const service = useMemo(() => new VisualizeService(lib.novels), [lib]);
  const [managing, setManaging] = useState(false);
  const [blocked, setBlocked] = useState<{ key: string; by: { key: string; why: string }[] } | null>(null);
  if (open === null) return null;
  const off = viewsOffOf(open.cast.snapshot.project);
  const parts = offeredViews(off);
  const columns = Math.max(1, Math.min(3, Math.floor((width - space.md * 2) / 300)));
  const plateWidth = (width - space.md * 2 - 12 * (columns - 1)) / columns;
  const setOff = (next: string[]) => {
    try {
      service.change(open.novelId, (c) => c.setViewsOff(next));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {atlasWords.title}
          </Text>
          <Text style={styles.intro}>{atlasWords.intro(parts.length)}</Text>
        </View>
      </View>
      <OutlineButton label={manageWords.title} icon="tune-variant" compact onPress={() => setManaging(true)} style={styles.start} />
      {atlasOf(parts).map(([subject, views]) => (
        <View key={subject} style={styles.subject}>
          <Text style={styles.subjectTitle} accessibilityRole="header">
            {subject.toUpperCase()}
          </Text>
          <View style={styles.plates}>
            {views.map((v) => (
              <View key={v.key} style={{ width: plateWidth }}>
                <Plate view={v.key} current={false} onPress={(to) => to !== null && router.navigate(to as never)} />
              </View>
            ))}
          </View>
        </View>
      ))}
      {parts.length === 0 && <Muted>Every view is turned off in this novel. Turn some on to see your records drawn.</Muted>}
      {managing && blocked === null && (
        <Sheet visible onClose={() => setManaging(false)} title={manageWords.title} footer={<GoldButton label={manageWords.done} onPress={() => setManaging(false)} style={styles.flex} />}>
          <Muted>{manageWords.intro}</Muted>
          {visualViews.filter(isBuilt).map((v) => (
            <View key={v.key} style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.switchTitle}>{v.label}</Text>
                <Muted numberOfLines={3}>{v.description}</Muted>
              </View>
              <Switch
                value={isViewOn(off, v.key)}
                onValueChange={(on) => {
                  if (on) {
                    const r = turnOn(off, v.key);
                    setOff(r.off);
                    if (r.alsoOn.length > 0) toast(manageWords.turnedOn(v.label, r.alsoOn.map(viewLabel)));
                    return;
                  }
                  const r = turnOff(off, [v.key]);
                  if (r.blocked.length === 0) setOff(r.off);
                  else setBlocked(r.blocked[0]);
                }}
                trackColor={{ true: colors.gold, false: colors.border }}
                thumbColor={colors.text}
                accessibilityLabel={v.label}
              />
            </View>
          ))}
        </Sheet>
      )}
      {blocked !== null && (
        <Sheet visible onClose={() => setBlocked(null)} title={manageWords.stays(viewLabel(blocked.key))}>
          <Text style={styles.text}>
            {manageWords.staysWhy(
              viewLabel(blocked.key),
              blocked.by.map((b) => ({ label: viewLabel(b.key), why: b.why })),
            )}
          </Text>
          <View style={styles.row}>
            <OutlineButton label={manageWords.keep(viewLabel(blocked.key))} compact tone="muted" onPress={() => setBlocked(null)} />
            <GoldButton
              label={manageWords.offAll([...blocked.by.map((b) => viewLabel(b.key)), viewLabel(blocked.key)])}
              compact
              onPress={() => {
                setOff(turnOff(off, [blocked.key, ...blocked.by.map((b) => b.key)]).off);
                setBlocked(null);
              }}
            />
          </View>
        </Sheet>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  body: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  intro: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 23, color: colors.muted, marginTop: 4 },
  subject: { gap: space.sm },
  subjectTitle: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: colors.gold },
  plates: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  switchTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.text },
  text: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
