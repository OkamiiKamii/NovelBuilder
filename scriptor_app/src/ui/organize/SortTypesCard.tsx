// SORT THESE: entries filed before Species, Artifacts, Rules and History had their own types, and Powers named like a
// system skill. Each is shown with its type and two buttons; nothing moves without a tap. Five at first, "Show all n".

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { entriesToSort, keepRest, keepType, moveType, type SortItem } from '../../domain/codex/sortTypes';
import { kindColor } from '../../domain/codex/screens/world';
import { StoryModel } from '../../domain/model/storyModel';
import { type SkillSortItem, skillsToSort } from '../../domain/systems/skillTies';
import { OutlineButton, Panel } from '../kit';
import { useSystems } from '../systems/useSystems';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import type { OpenCast } from './useCast';

const first = 5;

export function SortTypesCard({ open }: { open: OpenCast }) {
  const toast = useToast();
  const sys = useSystems();
  const [all, setAll] = useState(false);
  const [allSkills, setAllSkills] = useState(false);
  const items = entriesToSort(open.cast.entries, open.cast.model.categories.values());
  const snapshot = sys?.snapshot;
  const skills = useMemo(() => (snapshot ? skillsToSort(StoryModel.fromSnapshot(snapshot)) : []), [snapshot]);
  if (items.length === 0 && skills.length === 0) return null;
  const shown = all ? items : items.slice(0, first);
  const shownSkills = allSkills ? skills : skills.slice(0, first);
  const systemNames = new Set(skills.map((k) => k.ability.system.name));

  const decide = (item: SortItem, action: 'keep' | 'move') => {
    const done = open.now((c) => {
      if (action === 'keep') keepType(c, item.entry.id);
      else moveType(c, item.entry.id);
      return true;
    });
    if (done && action === 'move') toast(`“${item.entry.name}” moved to ${item.to.name}.`);
  };

  const decideSkill = (item: SkillSortItem, action: 'keep' | 'move') => {
    const done = sys?.now((c) => {
      if (action === 'keep') c.keepAsPower(item.entry.id);
      else c.moveToSkillAndTie(item.entry.id, item.abilityId);
      return true;
    });
    if (done && action === 'move') toast(`“${item.entry.name}” moved to ${item.to.name} and tied to ${item.ability.system.name}.`);
  };

  return (
    <Panel style={styles.card}>
      <Text style={styles.heading}>SORT THESE</Text>
      {items.length > 0 && (
        <>
          <Text style={styles.intro}>These were filed before Species, Artifacts, Rules and History had their own types.</Text>
          {shown.map((item) => (
            <Row key={item.entry.id} item={item} onKeep={() => decide(item, 'keep')} onMove={() => decide(item, 'move')} />
          ))}
          <View style={styles.buttons}>
            {items.length > first && <OutlineButton label={all ? 'Show fewer' : `Show all ${items.length}`} compact tone="muted" onPress={() => setAll(!all)} />}
            <OutlineButton
              label="Keep all the rest as they are"
              compact
              tone="muted"
              onPress={() => {
                open.now((c) => keepRest(c, items.map((i) => i.entry.id)));
              }}
            />
          </View>
        </>
      )}
      {skills.length > 0 && (
        <>
          <Text style={styles.intro}>These Powers share a name with a skill in {systemNames.size === 1 ? [...systemNames][0] : 'a system'}.</Text>
          {shownSkills.map((item) => (
            <Row key={item.entry.id} item={item} onKeep={() => decideSkill(item, 'keep')} onMove={() => decideSkill(item, 'move')} />
          ))}
          <View style={styles.buttons}>
            {skills.length > first && <OutlineButton label={allSkills ? 'Show fewer' : `Show all ${skills.length}`} compact tone="muted" onPress={() => setAllSkills(!allSkills)} />}
            <OutlineButton
              label="Keep all the rest as Powers"
              compact
              tone="muted"
              onPress={() => {
                sys?.now((c) => c.keepRestAsPowers(skills.map((k) => k.entry.id)));
              }}
            />
          </View>
        </>
      )}
    </Panel>
  );
}

/** One row: dot, name, its type, and the two choices. */
function Row({ item, onKeep, onMove }: { item: SortItem | SkillSortItem; onKeep: () => void; onMove: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: kindColor(item.from) }]} />
        <Text style={styles.name} numberOfLines={2}>
          {item.entry.name}
        </Text>
        <Text style={styles.kind}>{item.from.singular}</Text>
      </View>
      <View style={styles.buttons}>
        <OutlineButton label={item.choices[0].label} compact tone="muted" onPress={onKeep} />
        <OutlineButton label={item.choices[1].label} compact onPress={onMove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  heading: { fontFamily: fonts.display, fontSize: 13, fontWeight: '700', letterSpacing: 1, color: colors.gold },
  intro: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 21, color: colors.muted },
  row: { gap: 6, paddingVertical: space.xs, borderTopWidth: 1, borderTopColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, fontFamily: fonts.display, fontSize: 15, fontWeight: '700', color: colors.text },
  kind: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
