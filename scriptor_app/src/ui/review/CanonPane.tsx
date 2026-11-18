// CANON (FEATURES.md #314–#315): what is true in the novel's world, and where each statement stands (canon,
// provisional, conflicting, retconned or non-canon); the possible contradictions shown are observations, never rulings,
// and nothing changes until the author changes it. A statement's page: its wording (revised, not overwritten, once
// established), status, kind, what it is about, its sources pinned to a paragraph, the statements it contradicts, its
// history and notes. A port of flutter_app/lib/features/review/canon_page.dart; the logic is src/domain/canon/*.

import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { type CanonChanges } from '../../domain/canon/canonChanges';
import {
  dismissedOf,
  established,
  factKindLabels,
  factKinds,
  factSources,
  factWords,
  notesOf,
  sourceLabels,
  sourceTypes,
  statusOrder,
} from '../../domain/canon/facts';
import { type FactReview, describeSource } from '../../domain/canon/review';
import {
  type CanonFilters,
  aboutChoices,
  canonCardLines,
  canonGroups,
  canonMatches,
  canonWords as w,
  historyStepWords,
  inScriptorWords,
  pairWords,
} from '../../domain/canon/screens';
import { formatRelative } from '../../domain/characters/screens/parts';
import { localeCompare } from '../../domain/exchange/collation';
import { type CanonFact, type CanonStatus, canonStatusHint, canonStatusLabel, canonStatuses } from '../../domain/records/canon';
import { stableSorted } from '../../domain/reader/stableSort';
import { nodeLabel } from '../../domain/timeline/narrative';
import { ConfirmDelete, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { ChooserField, SavedText } from '../organize/parts';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { Box, reviewStyles as s } from './parts';
import { type OpenCanon, useCanon } from './useCanon';

const noFilters: CanonFilters = { query: '', status: null, kind: null, about: null };

export function CanonPane({ factId = null }: { factId?: string | null }) {
  const canon = useCanon();
  const [open, setOpen] = useState<string | null>(factId);
  const [filters, setFilters] = useState<CanonFilters>(noFilters);
  if (!canon) return null;
  const model = canon.open.cast.model;
  const reviews = canon.reviews;
  const flagged = reviews.filter((r) => r.flags.length > 0);
  const shown = reviews.filter((r) => canonMatches(r.fact, filters));
  const names = new Map([...model.entries.values()].map((e) => [e.id, e.name]));
  const about = aboutChoices(canon.facts, names);
  const opened = reviews.find((r) => r.fact.id === open) ?? null;
  const set = (patch: Partial<CanonFilters>) => setFilters({ ...filters, ...patch });

  return (
    <View style={s.gap}>
      <GoldButton
        label={w.newStatement}
        icon="plus"
        compact
        onPress={() => {
          const made = canon.now((c) => c.create());
          if (made) setOpen(made.id);
        }}
        style={styles.start}
      />
      {flagged.length > 0 && (
        <Box title={w.contradictions}>
          {canon.pairs.map((p) => (
            <Pressable key={`${p.a.id}|${p.b.id}`} accessibilityRole="button" onPress={() => setOpen(p.a.id)} style={styles.row}>
              <Text style={s.strong}>{p.a.subject}</Text>
              <Text style={s.small}>{pairWords(p)}</Text>
            </Pressable>
          ))}
          {flagged.flatMap((r) =>
            r.flags
              .filter((f) => f.kind !== 'fact')
              .map((f) => (
                <Pressable key={`${r.fact.id}:${f.key}`} accessibilityRole="button" onPress={() => setOpen(r.fact.id)} style={styles.row}>
                  <Text style={s.strong}>{r.fact.subject}</Text>
                  <Text style={s.small}>{inScriptorWords(f.message)}</Text>
                </Pressable>
              )),
          )}
          <Muted>{w.observations}</Muted>
        </Box>
      )}
      <Field label={w.search} placeholder={w.searchHint} value={filters.query} onChangeText={(v) => set({ query: v })} />
      <View style={styles.filters}>
        <View style={styles.filter}>
          <ChooserField<CanonStatus | null>
            label={w.status}
            value={filters.status}
            choices={[
              { value: null, label: `Every status (${reviews.length})` },
              ...statusOrder.map((st) => ({ value: st, label: `${canonStatusLabel[st]} (${reviews.filter((r) => r.fact.status === st).length})` })),
            ]}
            onChoose={(v) => set({ status: v })}
          />
        </View>
        <View style={styles.filter}>
          <ChooserField<string | null>
            label={w.kind}
            value={filters.kind}
            choices={[{ value: null, label: 'Every kind' }, ...factKinds.map((k) => ({ value: k, label: factKindLabels[k] }))]}
            onChoose={(v) => set({ kind: v })}
          />
        </View>
        {about.length > 0 && (
          <View style={styles.filter}>
            <ChooserField<string | null>
              label={w.about}
              value={filters.about}
              choices={[{ value: null, label: 'About anything' }, ...about.map((id) => ({ value: id, label: names.get(id)! }))]}
              onChoose={(v) => set({ about: v })}
            />
          </View>
        )}
      </View>
      {opened && <FactDetails key={opened.fact.id} canon={canon} review={opened} onClose={() => setOpen(null)} onOpen={setOpen} />}
      {reviews.length === 0 ? (
        <Box title={w.emptyTitle} caption={w.emptyMessage} />
      ) : shown.length === 0 ? (
        <Muted>{w.noMatch}</Muted>
      ) : (
        canonGroups(shown).map((g) => (
          <View key={g.status} style={s.gapSm}>
            <Text style={styles.group} accessibilityRole="header" accessibilityHint={canonStatusHint[g.status]}>
              {g.heading}
            </Text>
            {g.reviews.map((r) => {
              const card = canonCardLines(r);
              return (
                <Pressable
                  key={r.fact.id}
                  accessibilityRole="button"
                  onPress={() => setOpen(r.fact.id)}
                  style={({ pressed }) => [styles.card, r.fact.id === open && styles.cardOpen, pressed && { borderColor: colors.gold }]}
                >
                  <Text style={s.strong}>{card.title}</Text>
                  <Text style={s.body}>{card.statement}</Text>
                  <Text style={s.small}>{card.details}</Text>
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- one statement

function FactDetails({ canon, review, onClose, onOpen }: { canon: OpenCanon; review: FactReview; onClose: () => void; onOpen: (id: string) => void }) {
  const toast = useToast();
  const [sourceType, setSourceType] = useState('chapter');
  const [sourceRef, setSourceRef] = useState<string | null>(null);
  const [quote, setQuote] = useState('');
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState<'about' | 'conflict' | null>(null);
  const [revising, setRevising] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const model = canon.open.cast.model;
  const fact = review.fact;
  const flags = review.flags;
  const others = stableSorted(
    canon.facts.filter((f) => f.id !== fact.id),
    (a, b) => localeCompare(a.subject, b.subject),
  );
  const entries = stableSorted([...model.entries.values()], (a, b) => localeCompare(a.name, b.name));
  const chapters = stableSorted(
    [...model.nodes.values()].filter((n) => model.order.position.has(n.id)),
    (a, b) => model.order.position.get(a.id)! - model.order.position.get(b.id)!,
  );
  const events = stableSorted([...model.events.values()], (a, b) => localeCompare(a.name, b.name));
  const linked = new Set([...fact.conflictsWith, ...canon.facts.filter((f) => f.conflictsWith.includes(fact.id)).map((f) => f.id)]);
  const update = (change: (c: CanonChanges) => void) => canon.now((c) => change(c));
  const sourceLabel = (src: ReturnType<typeof factSources>[number]) =>
    inScriptorWords(
      describeSource(src, {
        node: (id) => model.nodes.get(id),
        entry: (id) => model.entries.get(id),
        event: (id) => model.events.get(id)?.name,
        category: (k) => model.categories.get(k),
      }).label,
    );
  const refChoices =
    sourceType === 'chapter'
      ? chapters.map((n) => ({ value: n.id, label: nodeLabel(model, n.id) }))
      : sourceType === 'entry'
        ? entries.map((e) => ({ value: e.id, label: e.name }))
        : events.map((e) => ({ value: e.id, label: e.name }));
  const canAdd = sourceType === 'note' ? note.trim().length > 0 : sourceRef !== null;

  return (
    <Panel style={styles.details}>
      <View style={styles.headRow}>
        <Text style={styles.detailsTitle} accessibilityRole="header">
          {w.fact}
        </Text>
        <IconButton icon="close" label={w.close} onPress={onClose} />
      </View>
      {flags.length > 0 && (
        <>
          {flags.map((f) => (
            <View key={f.key} style={s.warn}>
              <Text style={s.body}>{inScriptorWords(f.message)}</Text>
              <View style={s.row}>
                {f.otherId !== null && <OutlineButton label={w.openOther} compact onPress={() => onOpen(f.otherId!)} />}
                {f.dismiss !== null && <OutlineButton label={w.setAside} compact tone="muted" onPress={() => update((c) => c.dismiss(fact.id, f.dismiss!))} />}
              </View>
            </View>
          ))}
          <Muted>{w.onlyObservation}</Muted>
        </>
      )}
      {dismissedOf(fact).length > 0 && (
        <OutlineButton label={w.bringBack(dismissedOf(fact).length)} compact tone="muted" onPress={() => update((c) => c.undismiss(fact.id))} style={styles.start} />
      )}
      <SavedText label={w.subject} placeholder={w.subjectHint} value={fact.subject} onSave={(v) => canon.later(`${fact.id}:subject`, (c) => c.update(fact.id, { subject: v }))} />
      {established.includes(fact.status) ? (
        <View style={s.gapSm}>
          <Text style={s.label}>{w.statement.toUpperCase()}</Text>
          <Text style={s.body}>{fact.statement.trim().length === 0 ? 'No statement yet' : `“${fact.statement}”`}</Text>
          <OutlineButton label={w.revise} compact onPress={() => setRevising(true)} style={styles.start} />
        </View>
      ) : (
        <SavedText
          label={w.statement}
          placeholder={w.statementHint}
          value={fact.statement}
          multiline
          onSave={(v) => canon.later(`${fact.id}:statement`, (c) => c.update(fact.id, { statement: v }))}
        />
      )}
      <Text style={s.label}>{w.status.toUpperCase()}</Text>
      <View style={styles.chips}>
        {canonStatuses.map((st) => (
          <Chip key={st} label={canonStatusLabel[st]} selected={fact.status === st} onPress={() => fact.status !== st && update((c) => c.setStatus(fact.id, st))} />
        ))}
      </View>
      <Muted>{canonStatusHint[fact.status]}</Muted>
      {fact.status === 'retconned' && (
        <ChooserField<string>
          label={w.replacedBy}
          value={others.some((f) => f.id === fact.replacedById) ? fact.replacedById! : ''}
          choices={[{ value: '', label: w.notReplaced }, ...others.map((f) => ({ value: f.id, label: factWords(f) }))]}
          onChoose={(v) => update((c) => c.update(fact.id, { replacedById: { value: v === '' ? null : v } }))}
        />
      )}
      <ChooserField<string>
        label={w.kind}
        value={fact.kind}
        choices={factKinds.map((k) => ({ value: k, label: factKindLabels[k] }))}
        onChoose={(v) => update((c) => c.update(fact.id, { kind: v }))}
      />
      <Text style={s.label}>{w.about.toUpperCase()}</Text>
      <View style={styles.chips}>
        {fact.entryIds.map((id) => {
          const e = model.entries.get(id);
          return e ? (
            <Chip key={id} label={`${e.name}  ×`} selected={false} onPress={() => update((c) => c.update(fact.id, { entryIds: fact.entryIds.filter((x) => x !== id) }))} />
          ) : null;
        })}
        <OutlineButton label={w.addAbout} compact onPress={() => setPicking('about')} />
      </View>
      <Text style={s.label}>{w.sources.toUpperCase()}</Text>
      {factSources(fact).length === 0 && <Muted>{w.noSources}</Muted>}
      {factSources(fact).map((src) => (
        <View key={src.id} style={styles.line}>
          <View style={s.flex}>
            <Text style={s.body}>{sourceLabel(src)}</Text>
            {src.quote.length > 0 && <Text style={s.small}>“{src.quote}”</Text>}
          </View>
          <IconButton icon="close" label={`Remove source ${sourceLabel(src)}`} onPress={() => update((c) => c.removeSource(fact.id, src.id))} />
        </View>
      ))}
      <ChooserField<string>
        label={w.sourceKind}
        value={sourceType}
        choices={sourceTypes.map((t) => ({ value: t, label: inScriptorWords(sourceLabels[t]) }))}
        onChoose={(v) => {
          setSourceType(v);
          setSourceRef(null);
        }}
      />
      {sourceType !== 'note' && (
        <ChooserField<string | null> label={w.source} value={sourceRef} choices={[{ value: null, label: 'Choose…' }, ...refChoices]} onChoose={setSourceRef} />
      )}
      {sourceType === 'chapter' && <Field label={w.quote} placeholder={w.quoteHint} value={quote} onChangeText={setQuote} />}
      {sourceType === 'note' && <Field label={w.sourceNote} placeholder={w.sourceNoteHint} value={note} onChangeText={setNote} />}
      <OutlineButton
        label={w.addSource}
        compact
        disabled={!canAdd}
        onPress={() => {
          update((c) => c.addSource(fact.id, { type: sourceType, refId: sourceRef, quote, note }));
          setSourceRef(null);
          setQuote('');
          setNote('');
        }}
        style={styles.start}
      />
      <Text style={s.label}>{w.contradicts.toUpperCase()}</Text>
      {[...linked].map((id) => {
        const other = canon.facts.find((f) => f.id === id);
        if (!other) return null;
        return (
          <View key={id} style={styles.line}>
            <Pressable accessibilityRole="button" onPress={() => onOpen(other.id)} style={s.flex}>
              <Text style={s.strong}>{other.subject}</Text>
              <Text style={s.small}>
                “{other.statement}” ({canonStatusLabel[other.status]})
              </Text>
            </Pressable>
            <IconButton icon="link-variant-off" label={`Unlink ${other.subject}`} onPress={() => update((c) => c.unlinkConflict(fact.id, other.id))} />
          </View>
        );
      })}
      <OutlineButton label={w.linkConflict} compact onPress={() => setPicking('conflict')} style={styles.start} />
      <Text style={s.label}>{w.history.toUpperCase()}</Text>
      {fact.history.map((step, i) => (
        <View key={String(step['id'] ?? i)} style={styles.step}>
          <Text style={s.body}>{historyStepWords(step)}</Text>
          <Text style={s.small}>
            {[typeof step['at'] === 'number' ? formatRelative(step['at']) : null, typeof step['reason'] === 'string' && step['reason'].length > 0 ? step['reason'] : null]
              .filter((x) => x !== null)
              .join(' · ')}
          </Text>
        </View>
      ))}
      <SavedText label={w.notes} placeholder={w.notesHint} value={notesOf(fact)} multiline onSave={(v) => canon.later(`${fact.id}:notes`, (c) => c.update(fact.id, { notes: v }))} />
      <View style={styles.line}>
        <Muted style={s.flex}>{w.authority}</Muted>
        <OutlineButton label={w.delete} compact tone="danger" onPress={() => setDeleting(true)} />
      </View>

      {picking !== null && (
        <PickSheet
          title={picking === 'about' ? w.addAbout : w.linkConflict}
          choices={
            picking === 'about'
              ? entries.filter((e) => !fact.entryIds.includes(e.id)).map((e) => ({ value: e.id, label: e.name }))
              : others.filter((f) => !linked.has(f.id)).map((f) => ({ value: f.id, label: factWords(f) }))
          }
          onClose={() => setPicking(null)}
          onPick={(id) => {
            if (picking === 'about') update((c) => c.update(fact.id, { entryIds: [...fact.entryIds, id] }));
            else update((c) => c.linkConflict(fact.id, id));
            setPicking(null);
          }}
        />
      )}
      {revising && <ReviseSheet canon={canon} fact={fact} onClose={() => setRevising(false)} />}
      <ConfirmDelete
        visible={deleting}
        title={w.deleteTitle}
        message={w.deleteMessage(fact.subject)}
        confirmLabel={w.deleteConfirm}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          if (canon.now((c) => c.removeFact(fact.id)) !== undefined) {
            onClose();
            toast(`Deleted “${fact.subject}”.`);
          }
        }}
      />
    </Panel>
  );
}

/** A list to pick one from (an entry, a statement). */
function PickSheet({ title, choices, onPick, onClose }: { title: string; choices: { value: string; label: string }[]; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <Sheet visible onClose={onClose} title={title}>
      {choices.length === 0 && <Muted>Nothing more to add.</Muted>}
      {choices.map((c) => (
        <Pressable key={c.value} accessibilityRole="button" onPress={() => onPick(c.value)} style={({ pressed }) => [styles.pick, pressed && { backgroundColor: colors.elevated }]}>
          <Text style={s.body}>{c.label}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

/** Revising an established statement: the wording it has now is kept in its history, as a retcon or as a correction. */
function ReviseSheet({ canon, fact, onClose }: { canon: OpenCanon; fact: CanonFact; onClose: () => void }) {
  const [statement, setStatement] = useState(fact.statement);
  const [reason, setReason] = useState('');
  const [minor, setMinor] = useState(false);
  return (
    <Sheet
      visible
      onClose={onClose}
      title={w.reviseTitle}
      footer={
        <>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={s.flex} />
          <GoldButton
            label={minor ? w.correct : w.retcon}
            onPress={() => {
              canon.now((c) => c.revise(fact.id, statement, { reason, minor }));
              onClose();
            }}
            style={s.flex}
          />
        </>
      }
    >
      <Muted>{w.reviseNote(fact.status)}</Muted>
      <Field label={w.newWording} value={statement} onChangeText={setStatement} multiline />
      <Field label={w.reason} placeholder={w.reasonHint} value={reason} onChangeText={setReason} />
      <View style={styles.line}>
        <Text style={[s.body, s.flex]}>{w.minor}</Text>
        <Switch value={minor} onValueChange={setMinor} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.text} accessibilityLabel={w.minor} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start' },
  row: { gap: 2, paddingVertical: 6 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  filter: { flexGrow: 1, minWidth: 150 },
  group: { fontFamily: fonts.display, fontSize: 16, color: colors.text, marginTop: space.sm },
  card: { gap: 4, padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardOpen: { borderColor: colors.gold, backgroundColor: colors.elevated },
  details: { gap: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  detailsTitle: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  step: { gap: 2 },
  pick: { paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: 8 },
});
