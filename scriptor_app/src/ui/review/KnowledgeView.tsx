// SECRETS AND KNOWLEDGE (FEATURES.md #319), a view of Visualize: what each character holds of a secret, read only
// from what the author has recorded, and how that spreads along the reading or in story time. Nothing is inferred:
// someone with no record is "not recorded", never "unaware". Two things are checked, each from a stated rule, and only
// decided about here; nothing about anyone's knowledge changes. A port of
// flutter_app/lib/features/review/knowledge_page.dart; the reading is src/domain/characters/knowledge.ts.

import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { awarenessWords, cellWords, knowledgeWords as w, pointHeading } from '../../domain/canon/screens';
import { characterPath } from '../../domain/characters/screens/create';
import {
  type KnowledgeAxis,
  checkKnowledge,
  knowledgeAxes,
  knowledgeAxisLabel,
  knowledgeRuleWords,
  knowledgeRules,
  knowledgeSpread,
  recordWords,
  whoKnowsWhat,
} from '../../domain/characters/knowledge';
import { localeCompare } from '../../domain/exchange/collation';
import { mapOrNull, strOrNull } from '../../domain/json';
import { reviewDecisionLabel } from '../../domain/records/review';
import { stableSorted } from '../../domain/reader/stableSort';
import { Muted, OutlineButton, Panel } from '../kit';
import { ChooserField } from '../organize/parts';
import { colors, fonts, space } from '../theme';
import { VizFrame } from '../visualize/VizFrame';
import { Box, ReasonSheet, reviewStyles as s } from './parts';
import { useCanon } from './useCanon';

export function KnowledgeView({ secretId = null }: { secretId?: string | null }) {
  const canon = useCanon();
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(secretId);
  const [axis, setAxis] = useState<KnowledgeAxis>('reading');
  const [cellAt, setCellAt] = useState<{ characterId: string; point: number } | null>(null);
  const [explaining, setExplaining] = useState<{ key: string; message: string } | null>(null);

  const frame = (child: ReactNode) => (
    <VizFrame
      view="knowledge"
      title={w.title}
      filters={false}
      config={() => ({ mode: 'visual', layout: { ...(chosen !== null ? { ksecret: chosen } : {}), ...(axis === 'story' ? { kaxis: 'story' } : {}) } })}
      onApply={(c) => {
        const l = mapOrNull(c['layout']) ?? {};
        setChosen(strOrNull(l['ksecret']));
        setAxis(l['kaxis'] === 'story' ? 'story' : 'reading');
        setCellAt(null);
      }}
    >
      {child}
    </VizFrame>
  );
  if (!canon) return frame(null);
  const model = canon.open.cast.model;
  const owned = stableSorted(
    canon.secrets.filter((x) => model.entries.has(x.entryId)),
    (a, b) => {
      const c = localeCompare(model.entries.get(a.entryId)!.name, model.entries.get(b.entryId)!.name);
      return c !== 0 ? c : localeCompare(a.title, b.title);
    },
  );
  if (owned.length === 0) return frame(<Box title={w.emptyTitle} caption={w.emptyMessage} />);
  const secret = owned.find((x) => x.id === chosen) ?? owned[0];
  const owner = model.entries.get(secret.entryId)!.name;
  const spread = knowledgeSpread(secret, model, axis);
  const findings = checkKnowledge(canon.secrets, model).filter((f) => f.secretId === secret.id);
  const cell = cellAt === null ? null : (spread.rows.find((r) => r.characterId === cellAt.characterId)?.cells[cellAt.point] ?? null);
  const nameOf = (id: string) => model.entries.get(id)?.name ?? 'Someone';

  return frame(
    <View style={s.gap}>
      <ChooserField<string>
        label={w.which}
        value={secret.id}
        choices={owned.map((x) => ({ value: x.id, label: `${model.entries.get(x.entryId)!.name}: ${x.title}` }))}
        onChoose={(v) => {
          setChosen(v);
          setCellAt(null);
        }}
      />
      <ChooserField<KnowledgeAxis>
        label={w.along}
        value={axis}
        choices={knowledgeAxes.map((a) => ({ value: a, label: knowledgeAxisLabel[a] }))}
        onChoose={(v) => {
          setAxis(v);
          setCellAt(null);
        }}
      />
      <Text style={s.body}>
        <Text style={s.strong}>{w.whatIsTrue}</Text>
        {secret.description.trim().length === 0 ? w.notWritten : secret.description}
      </Text>
      <Muted>
        {owner}’s secret · {secret.status}
      </Muted>
      <OutlineButton label={w.recordOn(owner)} compact onPress={() => router.navigate(characterPath(secret.entryId, { tab: 'secrets' }) as never)} style={styles.start} />

      <Text style={styles.heading} accessibilityRole="header">
        {w.whoKnows}
      </Text>
      {whoKnowsWhat(
        secret,
        spread.rows.map((r) => r.characterId),
      ).map((g) => (
        <Text key={g.state ?? 'none'} style={s.body}>
          {awarenessWords(g.state)}: {g.ids.map(nameOf).join(', ')}
        </Text>
      ))}

      <Text style={styles.heading} accessibilityRole="header">
        {w.spreads(axis)}
      </Text>
      {spread.points.length === 0 ? (
        <Muted>{w.nothingPlaced(axis)}</Muted>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={styles.gridRow}>
              <Text style={[styles.head, styles.nameCol]}>{w.who}</Text>
              {spread.points.map((p) => (
                <Text key={p.id} style={[styles.head, styles.pointCol]} numberOfLines={3}>
                  {pointHeading(p)}
                </Text>
              ))}
              <Text style={[styles.head, styles.nowCol]}>{w.now}</Text>
            </View>
            {spread.rows.map((row) => (
              <View key={row.characterId} style={styles.gridRow}>
                <Text style={[s.body, styles.nameCol]} numberOfLines={2}>
                  {row.name}
                </Text>
                {row.cells.map((c, i) => {
                  const words = cellWords(row.name, spread.points[i].label, c);
                  const picked = cellAt?.characterId === row.characterId && cellAt.point === i;
                  return (
                    <Pressable
                      key={i}
                      accessibilityRole="button"
                      accessibilityLabel={words.label}
                      onPress={() => setCellAt({ characterId: row.characterId, point: i })}
                      style={[styles.pointCol, styles.cell, c.here.length > 0 && styles.cellHere, picked && styles.cellPicked]}
                    >
                      <Text style={styles.code}>{words.code}</Text>
                    </Pressable>
                  );
                })}
                <Text style={[s.small, styles.nowCol]}>{awarenessWords(row.now.state, row.now.record?.belief ?? '')}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      <Muted>{w.legend}</Muted>
      {cell !== null && (
        <Panel style={s.gapSm}>
          <Text style={s.body}>{cell.record !== null ? w.inForce(recordWords(cell.record, model)) : w.noneInForce}</Text>
          {cell.here.some((r) => r !== cell.record) && <Text style={s.body}>{w.recordedHere(cell.here.map((r) => recordWords(r, model)).join('; '))}</Text>}
          {cell.needs.map((n, i) => (
            <Text key={i} style={s.body}>
              {w.actsOn(n.note)}
            </Text>
          ))}
        </Panel>
      )}
      {spread.tellings.length > 0 && (
        <View style={s.gapSm}>
          <Text style={s.strong}>{w.toldWhom}</Text>
          {spread.tellings.map((t) => (
            <Text key={t.recordId} style={s.body}>
              {model.entries.get(t.fromId)?.name} → {model.entries.get(t.toId)?.name}, at {spread.points[t.point].label}
            </Text>
          ))}
        </View>
      )}
      {spread.rows
        .filter((r) => r.unplaced.length > 0)
        .map((r) => (
          <Muted key={r.characterId}>{w.unplaced(r.name, axis, r.unplaced.map((x) => recordWords(x, model)).join('; '))}</Muted>
        ))}

      <Text style={styles.heading} accessibilityRole="header">
        {w.checks}
      </Text>
      {knowledgeRules.map((r) => (
        <Text key={r} style={s.small}>
          <Text style={s.strong}>{knowledgeRuleWords[r].title}. </Text>
          {knowledgeRuleWords[r].rule} Needs: {knowledgeRuleWords[r].requires}
        </Text>
      ))}
      {findings.length === 0 && <Text style={s.body}>{w.nothing}</Text>}
      {findings.map((f) => {
        const decision = canon.decisionOf(f.key);
        return decision !== null ? (
          <View key={f.key} style={s.finding}>
            <Text style={s.body}>{f.message}</Text>
            <Text style={s.small}>
              {reviewDecisionLabel[decision.decision]}
              {decision.note.length > 0 ? ` · Your note: ${decision.note}` : ''}
            </Text>
            <OutlineButton label="Reopen" compact tone="muted" onPress={() => canon.reopen(decision.id)} accessibilityLabel={`Reopen: ${f.message}`} style={styles.start} />
          </View>
        ) : (
          <Panel key={f.key} style={s.gapSm}>
            <Text style={s.body}>
              {knowledgeRuleWords[f.rule].title}. {f.message}
            </Text>
            <Text style={s.small}>Because: {f.because}</Text>
            <View style={s.row}>
              <OutlineButton label="Mark as intentional…" compact onPress={() => setExplaining({ key: f.key, message: f.message })} accessibilityLabel={`Mark as intentional: ${f.message}`} />
              <OutlineButton label="Dismiss" compact tone="muted" onPress={() => canon.decide(f.key, f.message, 'dismissed')} accessibilityLabel={`Dismiss: ${f.message}`} />
            </View>
          </Panel>
        );
      })}
      {explaining && (
        <ReasonSheet
          reasons={false}
          hint={w.reasonHint}
          onClose={() => setExplaining(null)}
          onSave={(note) => {
            canon.decide(explaining.key, explaining.message, 'intentional', note);
            setExplaining(null);
          }}
        />
      )}
    </View>,
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start' },
  heading: { fontFamily: fonts.display, fontSize: 16, color: colors.text, marginTop: space.sm },
  gridRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 4 },
  head: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', color: colors.gold },
  nameCol: { width: 110, paddingRight: 6 },
  pointCol: { width: 96, paddingHorizontal: 4 },
  nowCol: { width: 150, paddingLeft: 6 },
  cell: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  cellHere: { borderColor: colors.gold },
  cellPicked: { backgroundColor: colors.elevated },
  code: { fontFamily: fonts.numbers, fontSize: 14, fontWeight: '700', color: colors.text },
});
