// THE SHELF: every keepsake at once, two to four to a wooden shelf, each standing a little askew. A port of the shelf
// in flutter_app/lib/app/shell/keepsakes.dart.

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { keepsakesOf, shelfAcross, shelfLine, shelvesOf, tiltOf } from '../../domain/keepsakes/shelf';
import { fonts, space } from '../theme';
import { KeepsakePage, Waiting, useKeepsake } from './parts';
import { KeepsakeTile, useOpened } from './tiles';

const ground = '#16110D';
const ink = '#F4EEDF';

export function ShelfPage() {
  const open = useKeepsake(null);
  const router = useRouter();
  const opened = useOpened();
  const width = Math.min(useWindowDimensions().width, 900);
  if (open === null) {
    return (
      <KeepsakePage title="The shelf" ground={ground} ink={ink}>
        <Waiting ink={ink} text="No novel is open." />
      </KeepsakePage>
    );
  }
  const keepsakes = keepsakesOf(String(open.snapshot.project['title'] ?? ''));
  const across = shelfAcross(width);
  const tile = (width - 32 - (across - 1) * space.md) / across;
  return (
    <KeepsakePage title="The shelf" ground={ground} ink={ink}>
      <Text style={styles.line}>{shelfLine(keepsakes, opened)}</Text>
      {shelvesOf(keepsakes, across).map((shelf, s) => (
        <View key={s} style={styles.shelf}>
          <View style={styles.standing}>
            {shelf.map((k, p) => (
              <KeepsakeTile key={k.id} k={k} isNew={!opened.has(k.id)} width={tile} tilt={tiltOf(s, p, across)} onPress={() => router.navigate(k.path as never)} />
            ))}
          </View>
          <LinearGradient colors={['#7A5232', '#4A2E19']} style={styles.board} />
        </View>
      ))}
    </KeepsakePage>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: fonts.book, fontSize: 14, lineHeight: 21, color: ink, opacity: 0.8, textAlign: 'center' },
  shelf: { width: '100%' },
  standing: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xs, alignItems: 'flex-end' },
  board: { height: 12, borderRadius: 2, marginTop: -2, elevation: 6 },
});
