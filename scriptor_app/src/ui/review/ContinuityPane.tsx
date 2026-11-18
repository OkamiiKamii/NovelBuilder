// CONTINUITY (FEATURES.md #316–#317): the manuscript read word by word against what the author tracks (deaths,
// absences, items lost or held, travel times, the limits of a power) and against the ages and colours in character
// profiles. Every finding "appears to": the author fixes the text in Write, updates canon (after confirming the exact
// change), marks it intentional (with a reason) or dismisses it; decided findings can be reopened. And what is tracked,
// recorded and edited here. A check only reads: nothing here writes a word of the manuscript. A port of
// flutter_app/lib/features/review/continuity_page.dart; the logic is src/domain/continuity/.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { characterPath } from '../../domain/characters/screens/create';
import { worldEntryPath } from '../../domain/codex/screens/entryPage';
import {
  type ContinuityTab,
  type IssueFilters,
  type RuleDraft,
  continuityView,
  continuityWords,
  decisionWord,
  issueCard,
  noIssueFilters,
  ruleCard,
  ruleDraft,
  ruleForm,
  ruleProblem,
  saveRule,
  severityTone,
  trackedGroups,
  updateCanonDialog,
} from '../../domain/continuity/screens/continuityPage';
import {
  type ContinuityRule,
  type Issue,
  type RuleKind,
  type Severity,
  intentionalReasons,
  issueCategoryLabels,
  ruleKindHints,
  ruleTimeUnits,
  severityHint,
  severityLabel,
} from '../../domain/continuity/rules';
import { ConfirmDelete, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { ChooserField } from '../organize/parts';
import { type OpenContinuity, useContinuity } from './useContinuity';
import { Skeleton } from '../states';

/** `heading` false when the page around it already says "Continuity" (its route). */
export function ContinuityPane({ tab: initialTab = 'issues', heading = true }: { tab?: ContinuityTab; heading?: boolean }) {
  const c = useContinuity();
  const [tab, setTab] = useState<ContinuityTab>(initialTab);
  const [filters, setFilters] = useState<IssueFilters>(noIssueFilters);
  const [form, setForm] = useState<{ kind: RuleKind; rule: ContinuityRule | null } | null>(null);
  const [stopping, setStopping] = useState<ContinuityRule | null>(null);
  if (c === null) return null;
  const { open, rules, result } = c;
  const model = open.cast.model;

  if (result === null) {
    return (
      <View style={styles.gap}>
        {heading && (
          <Text style={styles.title} accessibilityRole="header">
            {continuityWords.title}
          </Text>
        )}
        <Skeleton label="Reading…" caption />
      </View>
    );
  }
  const view = continuityView(result, rules, filters);
  const tracked = trackedGroups(rules);

  return (
    <View style={styles.gap}>
      {heading && (
        <Text style={styles.title} accessibilityRole="header">
          {continuityWords.title}
        </Text>
      )}
      <Text style={styles.header} accessibilityLiveRegion="polite">
        {view.header}
        {c.reading ? '  ·  reading…' : ''}
      </Text>
      <Muted>{view.read}</Muted>
      <View style={styles.wrap}>
        {view.tabs.map((t) => (
          <Chip key={t.tab} label={t.label} selected={tab === t.tab} onPress={() => setTab(t.tab)} />
        ))}
      </View>

      {tab === 'issues' && (
        <>
          {view.filters !== null && (
            <View style={styles.gapSm}>
              <ChooserField
                label={continuityWords.severity}
                value={filters.severity}
                choices={view.filters.severity}
                onChoose={(v) => setFilters({ ...filters, severity: v })}
              />
              <ChooserField
                label={continuityWords.kindOfCheck}
                value={filters.category}
                choices={view.filters.category}
                onChoose={(v) => setFilters({ ...filters, category: v })}
              />
              <ChooserField
                label={continuityWords.chapter}
                value={view.filters.chosenChapter}
                choices={view.filters.chapter}
                onChoose={(v) => setFilters({ ...filters, nodeId: v })}
              />
            </View>
          )}
          {view.empty !== null && (
            <Panel style={styles.gapSm}>
              <Text style={styles.cardTitle}>{view.empty.title}</Text>
              <Text style={styles.body}>{view.empty.message}</Text>
              {view.empty.track !== null && <GoldButton label={view.empty.track} compact onPress={() => setTab('tracked')} style={styles.start} />}
            </Panel>
          )}
          {view.noMatch !== null && <Muted>{view.noMatch}</Muted>}
          {view.groups.map((g) => (
            <View key={g.severity} style={styles.gapSm}>
              <Text style={styles.groupHeading} accessibilityRole="header" accessibilityHint={severityHint[g.severity]}>
                {g.heading}
              </Text>
              {g.issues.map((issue) => (
                <IssueCard key={issue.key} c={c} issue={issue} onTracked={() => setTab('tracked')} />
              ))}
            </View>
          ))}
        </>
      )}

      {tab === 'reviewed' && (
        <>
          {view.reviewedEmpty !== null && <Muted>{view.reviewedEmpty}</Muted>}
          {result.resolved.map(({ issue, resolution }) => (
            <Panel key={resolution.id} style={styles.gapSm}>
              <View style={styles.wrap}>
                <Tag label={decisionWord(resolution.decision)} />
                <Tag label={issueCategoryLabels[issue.category]} />
                <Muted>{issueCard(issue, model).where}</Muted>
              </View>
              <Text style={styles.body}>{issue.message}</Text>
              {resolution.note.length > 0 && <Muted>{continuityWords.yourNote(resolution.note)}</Muted>}
              <Excerpt issue={issue} />
              <OutlineButton label={continuityWords.reopen} compact onPress={() => c.now((x) => x.reopen(resolution.id))} style={styles.start} />
            </Panel>
          ))}
          {result.stale.length > 0 && (
            <View style={styles.gapSm}>
              <Text style={styles.subheading}>{view.staleHeading}</Text>
              {result.stale.map((r) => (
                <View key={r.id} style={styles.staleRow}>
                  <View style={styles.flex}>
                    <Text style={styles.body}>{r.message.length === 0 ? r.key : r.message}</Text>
                    {r.note.length > 0 && <Muted>{continuityWords.yourNote(r.note)}</Muted>}
                  </View>
                  <OutlineButton label={continuityWords.removeDecision} compact tone="muted" onPress={() => c.now((x) => x.reopen(r.id))} />
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {tab === 'tracked' && (
        <>
          <View style={styles.wrap}>
            {tracked.add.map((a) => (
              <OutlineButton key={a.kind} label={a.label} icon="plus" compact onPress={() => setForm({ kind: a.kind, rule: null })} />
            ))}
          </View>
          {view.trackedEmpty !== null && <Muted>{view.trackedEmpty}</Muted>}
          {tracked.groups.map((g) => (
            <View key={g.kind} style={styles.gapSm}>
              <Text style={styles.groupHeading} accessibilityRole="header">
                {g.heading}
              </Text>
              {g.rules.map((rule) => {
                const card = ruleCard(rule, model);
                return (
                  <Panel key={rule.id} style={styles.ruleRow}>
                    <View style={styles.flex}>
                      <Text style={styles.cardTitle}>{card.subject}</Text>
                      {card.lines.map((l, i) => (
                        <Muted key={i}>{l}</Muted>
                      ))}
                    </View>
                    <IconButton icon="pencil-outline" label={card.edit} onPress={() => setForm({ kind: rule.kind as RuleKind, rule })} />
                    <IconButton icon="delete-outline" label={card.stop} onPress={() => setStopping(rule)} color={colors.danger} />
                  </Panel>
                );
              })}
            </View>
          ))}
        </>
      )}

      {form !== null && <RuleFormSheet c={c} kind={form.kind} rule={form.rule} onClose={() => setForm(null)} />}
      {stopping !== null && (
        <ConfirmDelete
          visible
          title={continuityWords.stopTitle}
          message={ruleCard(stopping, model).stopMessage}
          confirmLabel={continuityWords.stopConfirm}
          onClose={() => setStopping(null)}
          onConfirm={() => {
            const id = stopping.id;
            setStopping(null);
            c.now((x) => x.removeRule(id));
          }}
        />
      )}
    </View>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

function SeverityChip({ severity }: { severity: Severity }) {
  const tone = severityTone[severity];
  return (
    <View style={[styles.severity, { backgroundColor: tone.background }]} accessibilityHint={severityHint[severity]}>
      <Text style={[styles.severityText, { color: tone.ink }]}>{severityLabel[severity]}</Text>
    </View>
  );
}

function Excerpt({ issue }: { issue: Issue }) {
  const at = issue.match.length === 0 ? -1 : issue.excerpt.indexOf(issue.match);
  return (
    <View style={styles.excerpt}>
      {at < 0 ? (
        <Text style={styles.excerptText}>{issue.excerpt}</Text>
      ) : (
        <Text style={styles.excerptText}>
          {issue.excerpt.substring(0, at)}
          <Text style={styles.match}>{issue.match}</Text>
          {issue.excerpt.substring(at + issue.match.length)}
        </Text>
      )}
    </View>
  );
}

function IssueCard({ c, issue, onTracked }: { c: OpenContinuity; issue: Issue; onTracked: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [explaining, setExplaining] = useState(false);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const card = issueCard(issue, c.open.cast.model);
  const dialog = updateCanonDialog(issue);
  return (
    <Panel style={styles.gapSm}>
      <View style={styles.wrap}>
        <SeverityChip severity={issue.severity} />
        <Tag label={card.category} />
        <Muted>{card.where}</Muted>
      </View>
      <Text style={styles.body}>{issue.message}</Text>
      <Excerpt issue={issue} />
      {(card.entries.length > 0 || card.tracked) && (
        <View style={styles.wrap}>
          {card.entries.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="link"
              onPress={() => router.navigate((e.character ? characterPath(e.id) : worldEntryPath(e.id)) as never)}
              style={styles.link}
            >
              <Text style={styles.linkText}>{e.name}</Text>
            </Pressable>
          ))}
          {card.tracked && (
            <Pressable accessibilityRole="link" onPress={onTracked} style={styles.link}>
              <Text style={styles.linkText}>{continuityWords.whatIsTracked}</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={styles.wrap}>
        <OutlineButton label={continuityWords.fixManuscript} icon="pencil-outline" compact onPress={() => c.openChapter(issue.nodeId, { term: issue.match, block: issue.block })} />
        {card.canUpdate && <OutlineButton label={continuityWords.updateCanon} compact onPress={() => setConfirming(true)} />}
        <OutlineButton
          label={continuityWords.intentional}
          compact
          onPress={() => {
            setExplaining(!explaining);
            setReason('');
          }}
        />
        <OutlineButton
          label={continuityWords.dismiss}
          compact
          tone="muted"
          onPress={() => c.now((x) => x.decide(issue.key, issue.message, 'dismissed', { nodeId: issue.nodeId }))}
        />
      </View>
      {explaining && (
        <View style={styles.gapSm}>
          <Field label={continuityWords.why} placeholder={continuityWords.whyHint} value={reason} onChangeText={setReason} autoFocus />
          <View style={styles.wrap}>
            {intentionalReasons.map((r) => (
              <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>
          <View style={styles.wrap}>
            <OutlineButton label={continuityWords.cancel} compact tone="muted" onPress={() => setExplaining(false)} />
            <GoldButton
              label={continuityWords.saveIntentional}
              compact
              onPress={() => {
                c.now((x) => x.decide(issue.key, issue.message, 'intentional', { note: reason, nodeId: issue.nodeId }));
                setExplaining(false);
              }}
            />
          </View>
        </View>
      )}
      {confirming && issue.fix !== null && (
        <Sheet
          visible
          onClose={() => setConfirming(false)}
          title={dialog.title}
          footer={
            <View style={styles.footer}>
              <OutlineButton label={continuityWords.cancel} tone="muted" onPress={() => setConfirming(false)} style={styles.flex} />
              <GoldButton
                label={dialog.confirm}
                onPress={() => {
                  setConfirming(false);
                  const fix = issue.fix!;
                  const done = c.now((x) => {
                    x.applyFix(fix);
                    return true;
                  });
                  if (done === true) toast(dialog.done);
                }}
                style={styles.flex}
              />
            </View>
          }
        >
          <Text style={styles.body}>{dialog.message}</Text>
        </Sheet>
      )}
    </Panel>
  );
}

/** Records or edits one thing the manuscript is checked against. */
function RuleFormSheet({ c, kind, rule, onClose }: { c: OpenContinuity; kind: RuleKind; rule: ContinuityRule | null; onClose: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<RuleDraft>(() => ruleDraft(kind, rule));
  const set = (patch: Partial<RuleDraft>) => setDraft({ ...draft, ...patch });
  const form = ruleForm(c.open.cast.model, kind, draft, rule !== null);
  const save = () => {
    const problem = ruleProblem(kind, draft);
    if (problem !== null) {
      toast(problem);
      return;
    }
    const done = c.now((x) => {
      saveRule(kind, draft, rule?.id ?? null)(x);
      return true;
    });
    if (done === true) onClose();
  };
  const choose = <T,>(label: string, value: T, choices: readonly { value: T; label: string }[], onChoose: (v: T) => void) => (
    <ChooserField label={label} value={value} choices={[...choices]} onChoose={onChoose} />
  );
  const none = (label: string) => ({ value: null as string | null, label });
  return (
    <Sheet
      visible
      onClose={onClose}
      title={form.title}
      wide
      footer={
        <View style={styles.footer}>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton label="Save" onPress={save} style={styles.flex} />
        </View>
      }
    >
      <View style={styles.gapSm}>
        <Muted>{ruleKindHints[kind]}</Muted>
        {choose(form.subjectLabel, draft.entryId, [none('Choose…'), ...form.subjects], (v) => set({ entryId: v }))}
        <Field label={form.aliases.label} placeholder={form.aliases.hint} value={draft.aliases} onChangeText={(v) => set({ aliases: v })} />
        {form.states !== null && choose('State', draft.state, form.states, (v) => set({ state: v }))}
        {form.holders !== null && choose('Held by', draft.holderId, [none('Choose…'), ...form.holders], (v) => set({ holderId: v }))}
        {form.travel !== null && (
          <>
            {choose('To', draft.toEntryId, [none('Choose…'), ...form.travel.to], (v) => set({ toEntryId: v }))}
            <Field
              label={form.travel.amountLabel}
              value={draft.amount}
              keyboardType="decimal-pad"
              onChangeText={(v) => set({ amount: v.replace(/[^0-9.]/g, '') })}
            />
            {choose(
              form.travel.unitLabel,
              draft.unit,
              ruleTimeUnits.map((u) => ({ value: u, label: u })),
              (v) => set({ unit: v }),
            )}
          </>
        )}
        {form.label !== null && <Field label={form.label.label} placeholder={form.label.hint} value={draft.label} onChangeText={(v) => set({ label: v })} />}
        {form.words !== null && <Field label={form.words.label} placeholder={form.words.hint} value={draft.words} onChangeText={(v) => set({ words: v })} />}
        {form.scope !== null && choose('Look for those words', draft.scope, form.scope, (v) => set({ scope: v }))}
        {form.span !== null && (
          <>
            {choose('From', draft.fromNodeId, form.span.from, (v) => set({ fromNodeId: v }))}
            {choose('Until', draft.untilNodeId, form.span.until, (v) => set({ untilNodeId: v }))}
          </>
        )}
      </View>
    </Sheet>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  footer: { flexDirection: 'row', gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  header: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  subheading: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  groupHeading: { fontFamily: fonts.display, fontSize: 17, color: colors.text, marginTop: space.xs },
  cardTitle: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  tagText: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.text },
  severity: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  severityText: { fontFamily: fonts.ui, fontSize: 12.5, fontWeight: '700' },
  excerpt: { borderLeftWidth: 3, borderLeftColor: colors.muted, backgroundColor: colors.elevated, padding: space.sm },
  excerptText: { fontFamily: fonts.book, fontSize: 14.5, lineHeight: 22, color: colors.text },
  match: { backgroundColor: 'rgba(243, 182, 58, 0.28)', color: colors.text, fontWeight: '700' },
  link: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline' },
  staleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
});
