// THE RELATIONSHIP PAGE (FEATURES.md #195–#197): "A and B", who is who, Swap who is who, "How it evolved" stage by
// stage, record a change at a chapter, each stage's editor, the other connections between them, and delete. A port of
// flutter_app/lib/features/relationships/relationship_page.dart; what it shows and what each press changes is
// src/domain/relationships/screens/relationshipPage.ts.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newId } from '../../domain/ids';
import type { JsonMap } from '../../domain/json';
import { RelationChanges, type StageInput } from '../../domain/relationships/relationChanges';
import { relationSettingsOf } from '../../domain/relationships/relationTypes';
import {
  attributeChosen,
  causeEventChosen,
  feelingChosen,
  fromRoleTyped,
  groupChosen,
  nameTyped,
  notesTyped,
  oneWayChosen,
  originTyped,
  recordChangeDialog,
  recordedChangeMessage,
  relationshipPageView,
  shownInChosen,
  type StageCardView,
  stageSaveKey,
  startChooser,
  startChosen,
  storyDateEdited,
  storyEventChosen,
  storyTimeChosen,
  titleTyped,
  toRoleTyped,
  typeChosen,
  whereChosen,
} from '../../domain/relationships/screens/relationshipPage';
import { ConfirmDelete, Sheet } from '../dialogs';
import { Chip, GoldButton, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { ChooserField, SavedText } from './parts';
import { type OpenNovel, useOpenNovel } from './useNovel';

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Runs `make` on the relationships' changes and saves them; a refusal is said, and nothing changes. */
export function useRelate(novel: OpenNovel | null) {
  const toast = useToast();
  const now = <T,>(make: (c: RelationChanges) => T): T | undefined => {
    if (!novel) return undefined;
    try {
      return novel.change((before) => {
        const c = new RelationChanges(before, { now: Date.now(), createId: newId });
        const result = make(c);
        return { after: c.snapshot, result };
      });
    } catch (e) {
      toast(message(e), { error: true });
      return undefined;
    }
  };
  /** Typing: saved through autosave under `key`, a moment after it stops. */
  const later = (key: string, make: (c: RelationChanges) => void) => {
    if (!novel) return;
    novel.lib.saves.schedule(key, () =>
      novel.change((before) => {
        const c = new RelationChanges(before, { now: Date.now(), createId: newId });
        make(c);
        return { after: c.snapshot, result: undefined };
      }),
    );
  };
  return { now, later };
}

export function RelationshipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const novel = useOpenNovel();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const relate = useRelate(novel);
  const [recordOpen, setRecordOpen] = useState(false);
  const [where, setWhere] = useState('');
  const [deleting, setDeleting] = useState(false);

  const settings = novel ? relationSettingsOf(novel.snapshot.rows('relationSettings')) : null;
  const view = novel && settings && id ? relationshipPageView(novel.model, settings, id) : null;
  if (!novel || !view) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>This relationship is no longer in the novel</Text>
        <OutlineButton label="Back to Organize" icon="arrow-left" onPress={() => router.navigate('/organize')} />
      </View>
    );
  }
  const relationId = view.relationId;
  const update = (stageId: string, input: StageInput | null) => {
    if (input) relate.now((c) => c.updateStage(relationId, stageId, input));
  };
  const typed = (stageId: string, what: Parameters<typeof stageSaveKey>[1], input: StageInput) =>
    relate.later(stageSaveKey(stageId, what), (c) => c.updateStage(relationId, stageId, input));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label={view.back.label} onPress={() => router.navigate(`/organize/character/${view.back.characterId}?tab=relationships`)} />
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
            {view.title}
          </Text>
          <Muted>{view.subtitle}</Muted>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{view.whoIsWhoTitle.toUpperCase()}</Text>
          <Text style={styles.text}>{view.whoIsWho}</Text>
          <View style={styles.row}>
            <OutlineButton label={view.openFrom} icon="account-outline" compact tone="muted" onPress={() => router.navigate(`/organize/character/${view.fromId}`)} />
            <OutlineButton label={view.openTo} icon="account-outline" compact tone="muted" onPress={() => router.navigate(`/organize/character/${view.toId}`)} />
            <OutlineButton label={view.swapLabel} icon="swap-horizontal" compact onPress={() => relate.now((c) => c.reverse(relationId))} />
          </View>
        </Panel>

        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{view.evolutionTitle.toUpperCase()}</Text>
          <Muted>{view.evolutionCaption}</Muted>
          {view.evolution.map((line, i) => (
            <Text key={i} style={styles.text}>
              {line}
            </Text>
          ))}
          <View style={styles.row}>
            <GoldButton label={view.recordChangeLabel} icon="plus" compact onPress={() => setRecordOpen(true)} />
            <OutlineButton label={view.settingsLabel} icon="cog-outline" compact tone="muted" onPress={() => router.navigate('/organize/relationships/settings')} />
          </View>
        </Panel>

        {view.stages.map((s) => (
          <StageCard key={s.stageId} card={s} novel={novel} relationId={relationId} update={update} typed={typed} relate={relate} />
        ))}

        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{view.betweenTitle.toUpperCase()}</Text>
          <Muted>{view.betweenCaption}</Muted>
          {view.between.length === 0 ? (
            <Muted>{view.betweenNone}</Muted>
          ) : (
            view.between.map((line, i) => (
              <Text key={i} style={styles.text}>
                {line}
              </Text>
            ))
          )}
        </Panel>

        <OutlineButton label={view.deleteLabel} icon="delete-outline" tone="danger" onPress={() => setDeleting(true)} style={styles.start} />
      </ScrollView>

      <Sheet
        visible={recordOpen}
        onClose={() => setRecordOpen(false)}
        title={recordChangeDialog.title}
        footer={
          <>
            <OutlineButton label={recordChangeDialog.cancel} onPress={() => setRecordOpen(false)} tone="muted" style={styles.flex} />
            <GoldButton
              label={recordChangeDialog.confirm}
              onPress={() => {
                setRecordOpen(false);
                const w = whereChosen(where);
                const added = relate.now((c) => c.addStage(relationId, w.nodeId, { unknown: w.unknown }));
                if (added) toast(recordedChangeMessage);
              }}
              style={styles.flex}
            />
          </>
        }
      >
        <Muted>{recordChangeDialog.text}</Muted>
        {(() => {
          const ch = startChooser(novel.model, where);
          return <ChooserField label={ch.label} value={ch.value} choices={ch.choices} onChoose={setWhere} />;
        })()}
      </Sheet>
      <ConfirmDelete
        visible={deleting}
        title={view.deleteConfirm.title}
        message={view.deleteConfirm.message}
        confirmLabel={view.deleteConfirm.confirmLabel}
        onConfirm={() => {
          setDeleting(false);
          const back = view.back.characterId;
          relate.now((c) => c.removeRelation(relationId));
          router.navigate(`/organize/character/${back}?tab=relationships`);
        }}
        onClose={() => setDeleting(false)}
      />
    </View>
  );
}

function StageCard({
  card,
  novel,
  relationId,
  update,
  typed,
  relate,
}: {
  card: StageCardView;
  novel: OpenNovel;
  relationId: string;
  update: (stageId: string, input: StageInput | null) => void;
  typed: (stageId: string, what: Parameters<typeof stageSaveKey>[1], input: StageInput) => void;
  relate: ReturnType<typeof useRelate>;
}) {
  const toast = useToast();
  const [removing, setRemoving] = useState(false);
  const id = card.stageId;
  const stage = novel.model.relations.get(relationId)?.stages.find((s) => s.id === id) ?? null;
  return (
    <Panel style={styles.panel}>
      <View style={styles.stageHead}>
        <Text style={[styles.kicker, styles.flex]}>{card.header.toUpperCase()}</Text>
        {card.movable && (
          <>
            <IconButton icon="arrow-up" label={card.moveEarlierTooltip} onPress={() => relate.now((c) => c.moveStage(relationId, id, -1))} />
            <IconButton icon="arrow-down" label={card.moveLaterTooltip} onPress={() => relate.now((c) => c.moveStage(relationId, id, 1))} />
          </>
        )}
        {card.remove && <IconButton icon="delete-outline" label={card.remove.tooltip} color={colors.danger} onPress={() => setRemoving(true)} />}
      </View>
      <ChooserField label={card.start.label} value={card.start.value} choices={card.start.choices} onChoose={(v) => update(id, startChosen(v))} />
      <ChooserField label={card.type.label} value={card.type.value} choices={card.type.choices} onChoose={(v) => update(id, typeChosen(v))} />
      {card.custom && (
        <>
          <SavedText label={card.custom.name.label} value={card.custom.name.value} onSave={(v) => typed(id, 'label', nameTyped(v))} />
          <View style={styles.row}>
            <Chip label={card.custom.oneWay.label} icon="arrow-right" selected={card.custom.oneWay.value} onPress={() => update(id, oneWayChosen(!card.custom!.oneWay.value))} />
          </View>
          <SavedText label={card.custom.fromRole.label} value={card.custom.fromRole.value} onSave={(v) => typed(id, 'from', fromRoleTyped(v))} />
          {card.custom.toRole && <SavedText label={card.custom.toRole.label} value={card.custom.toRole.value} onSave={(v) => typed(id, 'to', toRoleTyped(v))} />}
          <ChooserField label={card.custom.group.label} value={card.custom.group.value} choices={card.custom.group.choices} onChoose={(v) => update(id, groupChosen(v))} />
        </>
      )}
      {card.roles && <Text style={styles.roles}>{card.roles}</Text>}
      <SavedText label={card.title.label} placeholder={card.title.hint} value={card.title.value} onSave={(v) => typed(id, 'title', titleTyped(v))} />
      <Text style={styles.label}>{card.feelingHeading.toUpperCase()}</Text>
      <View style={styles.row}>
        {card.feelings.map((f) => (
          <Chip key={f.affinity} label={f.label} selected={f.selected} onPress={() => update(id, feelingChosen(f.affinity))} />
        ))}
      </View>
      {card.attributes.map((a) => (
        <View key={a.key} style={styles.attribute}>
          <Text style={styles.label}>{a.heading.toUpperCase()}</Text>
          <View style={styles.row}>
            {a.sides.map((side) => (
              <View key={side.side} style={styles.side}>
                <ChooserField label={side.chooser.label} value={side.chooser.value} choices={side.chooser.choices} onChoose={(v) => update(id, attributeChosen(a.key, side.side, v))} />
              </View>
            ))}
          </View>
        </View>
      ))}
      <ChooserField
        label={card.storyTime.label}
        value={card.storyTime.value}
        choices={card.storyTime.choices}
        onChoose={(v) => {
          const r = stage ? storyTimeChosen(novel.model, stage, v) : null;
          if (!r) return;
          if ('tell' in r) toast(r.tell);
          else update(id, r.input);
        }}
      />
      {card.storyEvent && (
        <ChooserField label={card.storyEvent.label} value={card.storyEvent.value} choices={card.storyEvent.choices} onChoose={(v) => update(id, storyEventChosen(v))} />
      )}
      {card.storyDate && stage && <DateLine when={card.storyDate.when} legend={card.storyDate.legend} onEdit={(edit) => update(id, storyDateEdited(stage, edit))} />}
      <ChooserField label={card.cause.label} value={card.cause.value} choices={card.cause.choices} onChoose={(v) => update(id, causeEventChosen(v))} />
      <ChooserField label={card.shownIn.label} value={card.shownIn.value} choices={card.shownIn.choices} onChoose={(v) => update(id, shownInChosen(v))} />
      <SavedText label={card.origin.label} value={card.origin.value} multiline minLines={2} onSave={(v) => typed(id, 'event', originTyped(v))} />
      <SavedText label={card.notes.label} value={card.notes.value} multiline minLines={3} onSave={(v) => typed(id, 'notes', notesTyped(v))} />
      {card.remove && (
        <ConfirmDelete
          visible={removing}
          title={card.remove.confirm.title}
          message={card.remove.confirm.message}
          confirmLabel={card.remove.confirm.confirmLabel}
          onConfirm={() => {
            setRemoving(false);
            relate.now((c) => c.removeStage(relationId, id));
          }}
          onClose={() => setRemoving(false)}
        />
      )}
    </Panel>
  );
}

/** A date in story time, as rough as the author knows it: the year, and the month and day when known. The full date
 * editor (seasons, approximate and relative dates, the novel's own calendar) comes with the timeline in Plan. */
function DateLine({ when, legend, onEdit }: { when: JsonMap | null; legend: string; onEdit: (edit: (when: JsonMap) => JsonMap) => void }) {
  const num = (k: string) => (typeof when?.[k] === 'number' ? String(when[k]) : '');
  const set = (k: string, v: string) => {
    const n = v.trim() === '' ? null : Number(v.trim());
    if (n !== null && !Number.isInteger(n)) return;
    onEdit((w) => ({ ...w, precision: w['precision'] ?? 'exact', [k]: n }));
  };
  return (
    <View>
      <Text style={styles.label}>{legend.toUpperCase()}</Text>
      <View style={styles.row}>
        <View style={styles.side}>
          <SavedText label="Year" value={num('year')} onSave={(v) => set('year', v)} />
        </View>
        <View style={styles.side}>
          <SavedText label="Month" value={num('month')} onSave={(v) => set('month', v)} />
        </View>
        <View style={styles.side}>
          <SavedText label="Day" value={num('day')} onSave={(v) => set('day', v)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  body: { padding: space.md, gap: space.md, maxWidth: 820, width: '100%', alignSelf: 'center' },
  panel: { gap: space.sm },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold, marginTop: space.xs },
  text: { fontFamily: fonts.book, fontSize: 15, lineHeight: 23, color: colors.text },
  roles: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.muted, marginBottom: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stageHead: { flexDirection: 'row', alignItems: 'center' },
  attribute: { marginTop: space.xs },
  side: { flex: 1, minWidth: 130 },
  start: { alignSelf: 'flex-start' },
});

