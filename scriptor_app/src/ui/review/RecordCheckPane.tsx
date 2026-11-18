// RECORD CHECK (FEATURES.md #310–#311): references to deleted records (taken out, or a connection with a missing end
// removed), references that name nothing ("Point it at"), values that do not fit their fields, views set up on fields
// that no longer suit, look-alike entries ("Not duplicates", or Merge: the whole plan first, confirmed by typing the
// name, a restore point kept, Undo), and connections marked disputed or invalid. Nothing changes until a fix is chosen.
// A port of flutter_app/lib/features/review/record_check_page.dart; the logic is src/domain/review/screens/recordCheck.ts.

import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MergePlan } from '../../domain/integrity/fixes';
import type { DuplicatePair } from '../../domain/integrity/rules';
import { EntityRef } from '../../domain/model/entityRef';
import {
  brokenLine,
  flaggedLine,
  kindsPath,
  mergeConfirmed,
  mergeWords as mw,
  notDuplicatesMessage,
  recordCheck,
  recordCheckWords as w,
  unresolvedLine,
} from '../../domain/review/screens/recordCheck';
import { worldWords } from '../../domain/review/screens/warnings';
import { Sheet } from '../dialogs';
import { GoldButton, Muted, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { Box } from './parts';
import { type OpenReview, useReview } from './useReview';
import { useOpenFromReview } from './WarningsPane';

export function RecordCheckPane() {
  const r = useReview();
  const [merging, setMerging] = useState<DuplicatePair | null>(null);
  if (r === null) return <Muted>Review works inside one novel. Open one from the Library.</Muted>;
  return <RecordCheckBody r={r} merging={merging} setMerging={setMerging} />;
}

function RecordCheckBody({ r, merging, setMerging }: { r: OpenReview; merging: DuplicatePair | null; setMerging: (d: DuplicatePair | null) => void }) {
  const router = useRouter();
  const go = useOpenFromReview(r);
  const { cast } = r.open;
  const model = cast.model;
  const check = recordCheck(cast.snapshot, model, cast.novelTitle);
  const name = (ref: EntityRef) => model.resolve(ref)?.label ?? 'something deleted';
  const opens = (ref: EntityRef) => (ref.type === 'entry' || ref.type === 'node') && model.exists(ref);
  const openButton = (ref: EntityRef, label?: string) =>
    opens(ref) ? <LinkButton key={`open:${ref.type}:${ref.id}:${label ?? ''}`} label={label ?? name(ref)} onPress={() => go.openRef(ref)} /> : <Text key={`name:${ref.id}`} style={styles.plain}>{label ?? name(ref)}</Text>;
  const novelId = r.novelId;

  return (
    <View style={styles.gap}>
      <Muted>{check.subtitle}</Muted>
      <Box title={w.broken(check.broken.length)} caption={w.brokenCaption}>
        {check.broken.length === 0 && <Muted>{w.none}</Muted>}
        {check.broken.map((b) => {
          const line = brokenLine(b);
          return (
            <Finding key={b.key} message={line.message} detail={line.detail}>
              {line.whereKept !== null && opens(line.whereKept) && openButton(line.whereKept, w.openWhereKept)}
              {line.fix !== null ? (
                <OutlineButton label={line.fix} compact tone="muted" onPress={() => r.run('Taking it out', () => r.service.removeReference(novelId, b.table, b.rowId, b.missing.id))} />
              ) : (
                <Muted>{w.inText}</Muted>
              )}
            </Finding>
          );
        })}
      </Box>
      <Box title={w.unresolved(check.unresolved.length)} caption={w.unresolvedCaption}>
        {check.unresolved.length === 0 && <Muted>{w.none}</Muted>}
        {check.unresolved.map((u) => (
          <Finding key={u.key} message={unresolvedLine(u)}>
            {openButton(new EntityRef('entry', u.entry.id), w.open(u.entry.name))}
            {u.suggestions.length === 0 && <Muted>{w.noSuchEntry}</Muted>}
            {u.suggestions.map((s) => (
              <OutlineButton
                key={s.id}
                label={w.pointAt(s.name)}
                compact
                tone="muted"
                onPress={() => r.run('Pointing it', () => r.service.pointField(novelId, u.entry.id, u.fieldId, u.value, s.id))}
              />
            ))}
          </Finding>
        ))}
      </Box>
      <Box title={w.unfit(check.unfit.length)} caption={w.unfitCaption}>
        {check.unfit.length === 0 && <Muted>{w.none}</Muted>}
        {check.unfit.map((u) => (
          <Finding key={u.key} message={u.entry.name} detail={u.issues.map((i) => i.message).join('\n')}>
            {openButton(new EntityRef('entry', u.entry.id), w.open(u.entry.name))}
          </Finding>
        ))}
      </Box>
      <Box title={w.unsuited(check.unsuited.length)} caption={w.unsuitedCaption}>
        {check.unsuited.length === 0 && <Muted>{w.none}</Muted>}
        {check.unsuited.map((u) => (
          <Finding key={u.key} message={u.category.name} detail={u.problems.join('\n')}>
            <LinkButton label={w.openSettings} accessibilityLabel={`Open the view settings of ${u.category.name}`} onPress={() => router.navigate(kindsPath(u.category.key) as never)} />
          </Finding>
        ))}
      </Box>
      <Box title={w.duplicates(check.openDuplicates.length)} caption={w.duplicatesCaption}>
        {check.openDuplicates.length === 0 && <Muted>{w.none}</Muted>}
        {check.openDuplicates.map((d) => (
          <Finding key={d.key} message={`${d.a.name} and ${d.b.name}`} detail={d.because}>
            {openButton(new EntityRef('entry', d.a.id), w.open(d.a.name))}
            {openButton(new EntityRef('entry', d.b.id), w.openOther)}
            <OutlineButton label={w.merge} compact onPress={() => setMerging(d)} />
            <LinkButton
              label={w.notDuplicates}
              accessibilityLabel={`Not duplicates: ${d.a.name} and ${d.b.name}`}
              onPress={() => r.run('Deciding', () => r.service.decide(novelId, d.key, notDuplicatesMessage(d), 'dismissed'))}
            />
          </Finding>
        ))}
        {check.decidedDuplicates.length > 0 && <Text style={styles.subheading}>{w.decidedHeading}</Text>}
        {check.decidedDuplicates.map((d) => (
          <Finding key={d.pair.key} message={`${d.pair.a.name} and ${d.pair.b.name}`}>
            <LinkButton label={w.reopen} onPress={() => r.run('Reopening', () => r.service.reopen(novelId, d.decision.id))} />
          </Finding>
        ))}
      </Box>
      <Box title={w.flagged(check.flagged.length)} caption={w.flaggedCaption}>
        {check.flagged.length === 0 && <Muted>{w.none}</Muted>}
        {check.flagged.map((c) => {
          const line = flaggedLine(c, name);
          return (
            <Finding key={c.id} message={line.message} detail={line.detail}>
              {openButton(c.from)}
              {openButton(c.to)}
            </Finding>
          );
        })}
      </Box>
      {merging !== null && <MergeSheet r={r} pair={merging} onClose={() => setMerging(null)} />}
    </View>
  );
}

function Finding({ message, detail, children }: { message: string; detail?: string; children?: ReactNode }) {
  return (
    <View style={styles.finding}>
      <Text style={styles.message}>{worldWords(message)}</Text>
      {detail !== undefined && detail.length > 0 && <Muted>{worldWords(detail)}</Muted>}
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

function LinkButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** A merge, shown in full before anything happens: which one to keep, what would point at it, what is added, what is
 * not kept. It goes ahead only once the name of the one merged away is typed, after a restore point is kept. */
function MergeSheet({ r, pair, onClose }: { r: OpenReview; pair: DuplicatePair; onClose: () => void }) {
  const toast = useToast();
  const [keepId, setKeepId] = useState(pair.a.id);
  const [typed, setTyped] = useState('');
  const keep = keepId === pair.a.id ? pair.a : pair.b;
  const merge = keepId === pair.a.id ? pair.b : pair.a;
  // Worked out once for the choice (it reads the whole novel).
  const { plan, problem } = useMemo<{ plan: MergePlan | null; problem: string | null }>(() => r.mergePlan(keep.id, merge.id), [keep.id, merge.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirmed = mergeConfirmed(typed, merge.name);
  const go = () => {
    const names = mw.names(merge.name, keep.name);
    onClose();
    try {
      const kept = r.service.merge(r.novelId, keep.id, merge.id, names);
      toast(mw.merged(names), { action: { label: mw.undo, run: () => r.run('Undoing', () => r.service.undo(kept)) } });
    } catch (e) {
      toast(mw.failed(e instanceof Error ? e.message : String(e)), { error: true });
    }
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title={mw.title}
      wide
      footer={
        <View style={styles.actions}>
          <OutlineButton label={mw.cancel} compact tone="muted" onPress={onClose} />
          <GoldButton label={mw.go} compact disabled={plan === null || !confirmed} onPress={go} />
        </View>
      }
    >
      <Text style={styles.subheading}>{mw.which}</Text>
      {[pair.a, pair.b].map((e) => {
        const on = e.id === keepId;
        return (
          <Pressable
            key={e.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              setKeepId(e.id);
              setTyped('');
            }}
            style={({ pressed }) => [styles.radio, pressed && { backgroundColor: colors.elevated }]}
          >
            <View style={[styles.dot, on && styles.dotOn]} />
            <Text style={styles.message}>{mw.keep(e.name)}</Text>
          </Pressable>
        );
      })}
      {problem !== null && <Text style={styles.problem}>{problem}</Text>}
      {plan !== null && (
        <View style={styles.gapSm}>
          <Text style={styles.message}>{mw.intro(plan)}</Text>
          {plan.repointed.length === 0 && <Muted>{mw.nothingPoints}</Muted>}
          {plan.repointed.map((x) => (
            <Muted key={x.table}>{mw.repointed(x)}</Muted>
          ))}
          <Text style={styles.message}>{mw.added(plan)}</Text>
          {plan.combined.map((c) => (
            <Muted key={c}>{`•  ${c}`}</Muted>
          ))}
          {plan.dropped.length > 0 && (
            <>
              <Text style={styles.message}>{mw.notKept}</Text>
              {plan.dropped.map((d) => (
                <Muted key={d}>{`•  ${d}`}</Muted>
              ))}
            </>
          )}
          <Muted>{mw.restorePoint}</Muted>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={mw.typeName(merge.name)}
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            accessibilityLabel={mw.typeName(merge.name)}
            autoCorrect={false}
            style={styles.input}
          />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  finding: { gap: 4, paddingBottom: space.md },
  message: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  plain: { fontFamily: fonts.ui, fontSize: 14, color: colors.text, paddingVertical: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  link: { paddingVertical: 6, paddingHorizontal: 4, minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline' },
  subheading: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: colors.gold, marginTop: space.sm },
  radio: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.field },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.muted },
  dotOn: { borderColor: colors.gold, backgroundColor: colors.gold },
  problem: { fontFamily: fonts.ui, fontSize: 14, color: colors.danger },
  input: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
});
