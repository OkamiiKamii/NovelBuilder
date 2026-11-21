// The two World entry panels of the skill tie: "From <system>" on a tied entry (what the system says about the skill,
// who holds it, Open in the system, Untie) and "Tie to a system skill" on an untied Skill entry (tie it to an existing
// skill, or Log in The Job). The logic is src/domain/systems/skillTies.ts; the changes are systemChanges.ts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { characterPath } from '../../domain/characters/screens/create';
import { abilityId } from '../../domain/model/entityRef';
import type { StoryModel } from '../../domain/model/storyModel';
import type { Entry } from '../../domain/records/entry';
import { type SkillTie, jobSystems, untiedSkills } from '../../domain/systems/skillTies';
import { systemsPath } from '../../domain/systems/screens/systemsPage';
import { ActionSheet, ConfirmDelete } from '../dialogs';
import { GoldButton, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import type { OpenSystems } from '../systems/useSystems';
import { ChooserField } from './parts';
import { manySystems, skillChoiceLabel, tieWords, undoTie } from './skillTieWords';

/** The tab of a system that lists its classes, skills and items. */
const skillsTab = 'kits';

/** "From <system>": the system's side of a tied skill. */
export function FromSystemPanel({ sys, entry, tie }: { sys: OpenSystems; entry: Entry; tie: SkillTie }) {
  const router = useRouter();
  const toast = useToast();
  const [untying, setUntying] = useState(false);
  return (
    <Panel style={styles.panel}>
      <Text style={styles.kicker}>{tieWords.from(tie.system.name).toUpperCase()}</Text>
      {tie.rank !== null && <Text style={styles.text}>{`Rank ${tie.rank}`}</Text>}
      {tie.boosts.map((b, i) => (
        <Text key={`b${i}`} style={styles.text}>
          {b}
        </Text>
      ))}
      {tie.cost.map((c, i) => (
        <Text key={`c${i}`} style={styles.text}>
          {c}
        </Text>
      ))}
      {tie.cooldown.length > 0 && <Text style={styles.text}>{tie.cooldown}</Text>}
      <Text style={styles.label}>{tieWords.heldBy.toUpperCase()}</Text>
      {tie.holders.length === 0 && <Muted>{tieWords.noneYet}</Muted>}
      {tie.holders.map((h) => (
        <Pressable
          key={h.entryId}
          accessibilityRole="button"
          accessibilityLabel={h.name}
          onPress={() => router.navigate(characterPath(h.entryId) as never)}
          style={({ pressed }) => [styles.holder, pressed && { backgroundColor: colors.elevated }]}
        >
          <Text style={styles.holderName} numberOfLines={2}>
            {h.name}
          </Text>
        </Pressable>
      ))}
      <OutlineButton
        label={tieWords.openIn(tie.system.name)}
        icon="open-in-new"
        onPress={() => router.navigate(systemsPath({ systemId: tie.system.id, tab: skillsTab }) as never)}
        style={styles.start}
      />
      <OutlineButton label={tieWords.untie} icon="link-variant-off" compact tone="muted" onPress={() => setUntying(true)} style={styles.start} />
      <ConfirmDelete
        visible={untying}
        title={tieWords.untieTitle}
        message={tieWords.untieMessage(entry.name, tie.item.name, tie.system.name)}
        confirmLabel={tieWords.untie}
        onConfirm={() => {
          setUntying(false);
          if (sys.now((c) => (c.untieSkill(entry.id), true))) toast(tieWords.untied);
        }}
        onClose={() => setUntying(false)}
      />
    </Panel>
  );
}

/** "Tie to a system skill": an untied Skill entry, tied to an On system's skill or logged in The Job. Nothing when
 * there is nothing to tie to. */
export function TieToSystemPanel({ sys, model, entry }: { sys: OpenSystems; model: StoryModel; entry: Entry }) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const skills = untiedSkills(model);
  const jobs = jobSystems(model);
  if (skills.length === 0 && jobs.length === 0) return null;
  const withSystem = manySystems(skills);
  const log = (systemId: string, name: string) => {
    if (sys.now((c) => c.logInSystem(entry.id, systemId)) !== undefined) toast(tieWords.logged(name));
  };
  return (
    <Panel style={styles.panel}>
      <Text style={styles.kicker}>{tieWords.panelTitle.toUpperCase()}</Text>
      {skills.length > 0 && (
        <ChooserField
          label={tieWords.chooser}
          value=""
          choices={[{ value: '', label: tieWords.none }, ...skills.map((a) => ({ value: abilityId(a.system.id, a.item.id), label: skillChoiceLabel(a, withSystem) }))]}
          helper={tieWords.chooserHelper}
          onChoose={(id) => {
            const a = skills.find((s) => abilityId(s.system.id, s.item.id) === id);
            // The entry takes the skill's name; Undo gives back the one it had.
            const old = entry.name;
            if (a && sys.now((c) => (c.tieSkill(entry.id, id), true))) {
              toast(tieWords.tied(a.system.name), { action: { label: tieWords.undo, run: () => void sys.now(undoTie(entry.id, old)) } });
            }
          }}
        />
      )}
      {jobs.length > 0 && (
        <GoldButton
          label={tieWords.logIn(jobs.length === 1 ? jobs[0]!.name : 'System')}
          icon="plus"
          onPress={() => (jobs.length === 1 ? log(jobs[0]!.id, jobs[0]!.name) : setPicking(true))}
          style={styles.start}
        />
      )}
      <ActionSheet
        visible={picking}
        title={tieWords.pickJob}
        actions={jobs.map((j) => ({ label: j.name, icon: 'plus', onPress: () => log(j.id, j.name) }))}
        onClose={() => setPicking(false)}
      />
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.2, color: colors.muted },
  text: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  holder: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: 4 },
  holderName: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.gold },
});
