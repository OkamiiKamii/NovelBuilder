// A system's On | Off control: two labelled buttons side by side, the one in force filled (never colour alone: the
// words On and Off are on them, and the state is spoken). The words and the changes are in
// src/domain/systems/screens/systemsPage.ts.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SystemBlueprint } from '../../domain/records/system';
import { switchedToast, systemSwitch, turnSystemOff, turnSystemOn } from '../../domain/systems/screens/systemsPage';
import { colors, fonts } from '../theme';
import { useToast } from '../toast';
import type { OpenSystems } from './useSystems';

export function SystemSwitch({ sys, system }: { sys: OpenSystems; system: SystemBlueprint }) {
  const toast = useToast();
  const sw = systemSwitch(system);
  const press = (on: boolean) => {
    if (on === sw.on) return;
    if (sys.now(on ? turnSystemOn(system.id) : turnSystemOff(system.id)) !== undefined) toast(switchedToast(system.name, on));
  };
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={sw.accessibilityLabel} accessibilityHint={sw.hint}>
      {[true, false].map((on) => {
        const here = on === sw.on;
        return (
          <Pressable
            key={String(on)}
            accessibilityRole="radio"
            accessibilityLabel={`${system.name}: ${on ? 'On' : 'Off'}`}
            accessibilityState={{ checked: here }}
            onPress={() => press(on)}
            style={[styles.part, on ? styles.left : styles.right, here && styles.here]}
          >
            <Text style={[styles.text, here && { color: colors.onGold }]}>{on ? 'On' : 'Off'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'flex-start' },
  part: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gold, paddingHorizontal: 14 },
  left: { borderTopLeftRadius: 22, borderBottomLeftRadius: 22 },
  right: { borderTopRightRadius: 22, borderBottomRightRadius: 22, borderLeftWidth: 0 },
  here: { backgroundColor: colors.gold },
  text: { fontFamily: fonts.ui, fontSize: 14.5, fontWeight: '700', color: colors.gold },
});
