// SECTIONS AND FIELDS (FEATURES.md #172–#174): a profile's sections on its Overview or Details tab, each with its
// fields; add, rename, reorder, duplicate, hide, move or delete a section; add a field (suggested from the layouts, or
// of the author's own, of any type) and edit its value, name, type, choices and section; the fields every character
// shares. A port of flutter_app/lib/features/characters/widgets/sections_view.dart (logic in
// src/domain/characters/screens/sections.ts).

import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Listed } from '../../domain/characters/cast';
import type { ProfileSection, ProfileTab } from '../../domain/characters/characterRecords';
import {
  addFieldOffer,
  type FieldCard,
  fieldCard,
  fieldWords,
  otherTab,
  removeSectionDialog,
  renameSectionPrompt,
  sectionCard,
  sectionMenu,
  type SectionMenuItem,
  sectionsView,
} from '../../domain/characters/screens/sections';
import { splitChoices } from '../../domain/codex/fieldValues';
import type { FieldType } from '../../domain/records/category';
import type { EntryField } from '../../domain/records/entry';
import { ActionSheet, ConfirmDelete, PromptSheet, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { ChooserField, SavedText } from './parts';
import type { OpenCast } from './useCast';

export function SectionsView({ open, listed, tab }: { open: OpenCast; listed: Listed; tab: ProfileTab }) {
  const { cast } = open;
  const { entry, profile } = listed;
  const view = sectionsView(cast, entry, profile, tab);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const id = entry.id;
  const fieldOf = (fid: string): EntryField | null => entry.fields.find((f) => f.id === fid) ?? null;
  const sectionOf = (fid: string): ProfileSection | null => profile.sections.find((s) => s.fieldIds.includes(fid)) ?? null;
  const editingField = editing ? fieldOf(editing) : null;
  return (
    <View style={styles.wrap}>
      {view.visible.map(({ section, first, last }) => (
        <SectionCard key={section.id} open={open} listed={listed} section={section} place={{ first, last }} onEdit={setEditing} />
      ))}
      {view.hidden && (
        <Panel style={styles.panel}>
          <Muted>{view.hidden.title}</Muted>
          <View style={styles.row}>
            {view.hidden.sections.map((h) => (
              <OutlineButton key={h.section.id} label={h.section.name} icon="eye-outline" compact tone="muted" onPress={() => open.now((c) => c.updateSection(id, h.section.id, { hidden: false }))} />
            ))}
          </View>
        </Panel>
      )}
      {view.loose && (
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{view.loose.title.toUpperCase()}</Text>
          {view.loose.note && <Muted>{view.loose.note}</Muted>}
          {view.loose.fields.map((f) => (
            <FieldRow key={f.id} card={fieldCard(cast, entry, profile, f, null)} onPress={() => setEditing(f.id)} />
          ))}
          {view.loose.offeredTitle && (
            <>
              <Muted>{view.loose.offeredTitle}</Muted>
              <Folded count={view.loose.offered.length}>
                {view.loose.offered.map((d) => (
                  <Chip key={d.id} label={d.name} icon="plus" selected={false} onPress={() => open.now((c) => c.setFieldValue(id, d.id, ''))} />
                ))}
              </Folded>
            </>
          )}
        </Panel>
      )}
      <OutlineButton label={view.addSection.label} icon="plus" compact onPress={() => setAdding(true)} style={styles.start} />
      <PromptSheet
        visible={adding}
        title={view.addSection.prompt.title}
        label={view.addSection.prompt.label}
        confirmLabel={view.addSection.prompt.confirm}
        onSubmit={(name) => {
          setAdding(false);
          open.now((c) => c.addSection(id, name, tab));
        }}
        onClose={() => setAdding(false)}
      />
      {editingField && (
        <FieldSheet open={open} listed={listed} card={fieldCard(cast, entry, profile, editingField, sectionOf(editingField.id))} onClose={() => setEditing(null)} />
      )}
    </View>
  );
}

function SectionCard({
  open,
  listed,
  section,
  place,
  onEdit,
}: {
  open: OpenCast;
  listed: Listed;
  section: ProfileSection;
  place: { first: boolean; last: boolean };
  onEdit: (fieldId: string) => void;
}) {
  const { cast } = open;
  const { entry, profile } = listed;
  const id = entry.id;
  const card = sectionCard(entry, section);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [more, setMore] = useState(false);
  const [own, setOwn] = useState('');
  const [ownType, setOwnType] = useState<FieldType>('text');
  const offer = addFieldOffer(cast, entry, section, more);
  const pick = (item: SectionMenuItem) => {
    if (item === 'rename') setRenaming(true);
    else if (item === 'up') open.now((c) => c.moveSection(id, section.id, -1));
    else if (item === 'down') open.now((c) => c.moveSection(id, section.id, 1));
    else if (item === 'duplicate') open.now((c) => c.duplicateSection(id, section.id));
    else if (item === 'tab') open.now((c) => c.updateSection(id, section.id, { tab: otherTab(section) }));
    else if (item === 'hide') open.now((c) => c.updateSection(id, section.id, { hidden: true }));
    else setRemoving(true);
  };
  const rename = renameSectionPrompt(section);
  const removal = removeSectionDialog(section, card.fields.length);
  return (
    <Panel style={styles.panel}>
      <View style={styles.head}>
        <Text style={[styles.kicker, styles.flex]}>{card.title.toUpperCase()}</Text>
        <IconButton icon="dots-horizontal" label={card.menuTooltip} onPress={() => setMenu(true)} />
      </View>
      {card.fields.map((f) => (
        <FieldRow key={f.id} card={fieldCard(cast, entry, profile, f, section)} onPress={() => onEdit(f.id)} />
      ))}
      <Folded count={offer.suggestions.length}>
        {offer.suggestions.map((s) => (
          <Chip key={s.field.name} label={s.field.name} icon="plus" selected={false} onPress={() => open.now((c) => c.addField(id, section.id, s.field))} />
        ))}
      </Folded>
      {offer.button && <OutlineButton label={offer.button.label} icon="plus" compact tone="muted" onPress={() => setMore(true)} style={styles.start} />}
      {offer.form && (
        <View style={styles.form}>
          <Field label={offer.form.label} value={own} onChangeText={setOwn} />
          <ChooserField label="Type" value={ownType} choices={offer.form.types} onChoose={setOwnType} />
          <View style={styles.row}>
            <GoldButton
              label={offer.form.add}
              compact
              disabled={offer.form.suggestion(own, ownType) === null}
              onPress={() => {
                const s = offer.form!.suggestion(own, ownType);
                if (s && open.now((c) => c.addField(id, section.id, s))) setOwn('');
              }}
            />
            <OutlineButton label={offer.form.done} compact tone="muted" onPress={() => setMore(false)} />
          </View>
        </View>
      )}
      <ActionSheet
        visible={menu}
        title={section.name}
        onClose={() => setMenu(false)}
        actions={sectionMenu(section, place).map((m) => ({
          label: m.label,
          icon: m.item === 'delete' ? 'delete-outline' : m.item === 'up' ? 'arrow-up' : m.item === 'down' ? 'arrow-down' : m.item === 'hide' ? 'eye-off-outline' : m.item === 'duplicate' ? 'content-copy' : m.item === 'tab' ? 'swap-horizontal' : 'pencil-outline',
          tone: m.item === 'delete' ? 'danger' : undefined,
          hidden: !m.enabled,
          onPress: () => pick(m.item),
        }))}
      />
      <PromptSheet
        visible={renaming}
        title={rename.title}
        label={rename.label}
        initial={rename.initial}
        confirmLabel={rename.confirm}
        onSubmit={(name) => {
          setRenaming(false);
          open.now((c) => c.updateSection(id, section.id, { name }));
        }}
        onClose={() => setRenaming(false)}
      />
      {removal.empty ? (
        <ConfirmDelete
          visible={removing}
          title={removal.title}
          message={removal.message}
          confirmLabel={removal.confirm}
          onConfirm={() => {
            setRemoving(false);
            open.now((c) => c.removeSection(id, section.id));
          }}
          onClose={() => setRemoving(false)}
        />
      ) : (
        <Sheet visible={removing} onClose={() => setRemoving(false)} title={removal.title}>
          <Text style={styles.text}>{removal.message}</Text>
          <View style={styles.column}>
            <OutlineButton
              label={removal.sectionOnly}
              onPress={() => {
                setRemoving(false);
                open.now((c) => c.removeSection(id, section.id, { deleteFields: false }));
              }}
            />
            <OutlineButton
              label={removal.alsoFields}
              tone="danger"
              onPress={() => {
                setRemoving(false);
                open.now((c) => c.removeSection(id, section.id, { deleteFields: true }));
              }}
            />
            <OutlineButton label={removal.cancel} tone="muted" onPress={() => setRemoving(false)} />
          </View>
        </Sheet>
      )}
    </Panel>
  );
}

/** Unfilled suggestions behind one muted line, so a new character's page isn't a wall of "+" chips. */
function Folded({ count, children }: { count: number; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (count === 0) return null;
  if (shown) return <View style={styles.row}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Add details, ${count} suggested fields`} onPress={() => setShown(true)} style={styles.fold}>
      <Text style={styles.foldText}>{`+ Add details (${count})`}</Text>
    </Pressable>
  );
}

function FieldRow({ card, onPress }: { card: FieldCard; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${card.label}: ${card.shown || card.empty}. ${card.editLabel}`} onPress={onPress} style={({ pressed }) => [styles.field, pressed && { backgroundColor: colors.elevated }]}>
      <Text style={styles.fieldLabel}>{card.label}</Text>
      {card.chips ? (
        <View style={styles.row}>
          {card.chips.map((c) => (
            <View key={c} style={styles.valueChip}>
              <Text style={styles.valueChipText}>{c}</Text>
            </View>
          ))}
        </View>
      ) : card.empty ? (
        <Text style={styles.empty}>{card.empty}</Text>
      ) : (
        <Text style={styles.value}>{card.shown}</Text>
      )}
      {card.issue && <Text style={styles.issue}>{card.issue.message}</Text>}
    </Pressable>
  );
}

/** A field opened: its value, edited the way its type is, and its settings. */
function FieldSheet({ open, listed, card, onClose }: { open: OpenCast; listed: Listed; card: FieldCard; onClose: () => void }) {
  const id = listed.entry.id;
  const fid = card.field.id;
  const [deleting, setDeleting] = useState(false);
  const write = (v: string) => {
    const change = card.changeOf(v);
    open.now((c) => c.updateField(id, fid, change));
  };
  const typeLater = (v: string) => {
    const change = card.changeOf(v);
    open.later(`field:${id}:${fid}`, (c) => c.updateField(id, fid, change));
  };
  const s = card.settings;
  return (
    <Sheet visible onClose={onClose} title={card.name} footer={<GoldButton label={fieldWords.done} onPress={onClose} style={styles.flex} />}>
      {card.help && <Muted>{card.help}</Muted>}
      {card.type === 'toggle' ? (
        <View style={styles.row}>
          <Chip label="Yes" selected={card.value === 'yes'} onPress={() => write(card.value === 'yes' ? '' : 'yes')} />
          <Chip label="No" selected={card.value === 'no'} onPress={() => write(card.value === 'no' ? '' : 'no')} />
        </View>
      ) : card.type === 'select' ? (
        <ChooserField label={card.label} value={card.value} choices={[{ value: '', label: 'Not recorded' }, ...card.options.map((o) => ({ value: o, label: o }))]} onChoose={write} />
      ) : card.type === 'multiselect' ? (
        <View style={styles.row}>
          {card.options.map((o) => {
            const chosen = splitChoices(card.value);
            const on = chosen.includes(o);
            return <Chip key={o} label={o} selected={on} onPress={() => write((on ? chosen.filter((x) => x !== o) : [...chosen, o]).join('\n'))} />;
          })}
        </View>
      ) : card.type === 'reference' ? (
        <ChooserField label={card.label} value={card.value} choices={[{ value: '', label: 'Nobody' }, ...card.linkable.map((e) => ({ value: e.id, label: e.name }))]} onChoose={write} />
      ) : card.type === 'references' ? (
        <View style={styles.row}>
          {card.linkable.map((e) => {
            const chosen = splitChoices(card.value);
            const on = chosen.includes(e.id);
            return <Chip key={e.id} label={e.name} selected={on} onPress={() => write((on ? chosen.filter((x) => x !== e.id) : [...chosen, e.id]).join('\n'))} />;
          })}
        </View>
      ) : (
        <SavedText
          label={card.label}
          value={card.type === 'tags' ? splitChoices(card.value).join(', ') : card.value}
          multiline={card.type === 'longtext'}
          minLines={card.type === 'longtext' ? 4 : 1}
          hint={card.type === 'tags' ? 'Comma separated' : undefined}
          onSave={(v) => typeLater(card.type === 'tags' ? v.split(',').map((x) => x.trim()).filter(Boolean).join('\n') : v)}
        />
      )}
      {card.openCharacter && <Muted>{card.openCharacter.label}</Muted>}

      <Text style={styles.kicker}>{fieldWords.settings.toUpperCase()}</Text>
      {s.shared && <Muted>{s.shared}</Muted>}
      {s.name !== null && <SavedText label={fieldWords.name} value={s.name} onSave={(v) => open.later(`field:${id}:${fid}:key`, (c) => c.updateField(id, fid, { key: v }))} />}
      {s.kindNote && <Muted>{s.kindNote}</Muted>}
      {s.types && <ChooserField label={fieldWords.type} value={card.type} choices={s.types} helper={s.typeHelper} onChoose={(t) => open.now((c) => c.updateField(id, fid, { type: t }))} />}
      {s.choices !== null && (
        <SavedText label={fieldWords.choices} value={s.choices} multiline minLines={3} onSave={(v) => open.later(`field:${id}:${fid}:options`, (c) => c.updateField(id, fid, { options: v.split('\n') }))} />
      )}
      <ChooserField
        label={fieldWords.section}
        value={s.section}
        choices={s.sections}
        onChoose={(sid) => {
          if (sid) open.now((c) => c.moveField(id, fid, { toSection: sid }));
        }}
      />
      <View style={styles.row}>
        <OutlineButton label={fieldWords.earlier} icon="arrow-up" compact tone="muted" onPress={() => open.now((c) => c.moveField(id, fid, { by: -1 }))} />
        <OutlineButton label={fieldWords.later} icon="arrow-down" compact tone="muted" onPress={() => open.now((c) => c.moveField(id, fid, { by: 1 }))} />
        <OutlineButton label={card.deleteConfirm.label} icon="delete-outline" compact tone="danger" onPress={() => setDeleting(true)} />
      </View>
      <ConfirmDelete
        visible={deleting}
        title={card.deleteConfirm.title}
        message={card.deleteConfirm.message}
        confirmLabel={card.deleteConfirm.confirm}
        onConfirm={() => {
          setDeleting(false);
          onClose();
          open.now((c) => c.removeField(id, fid));
        }}
        onClose={() => setDeleting(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  panel: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center' },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold, marginTop: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  column: { gap: space.sm, marginTop: space.md },
  start: { alignSelf: 'flex-start' },
  form: { marginTop: space.sm },
  fold: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  foldText: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted },
  field: { paddingVertical: space.sm, paddingHorizontal: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: radius.field, gap: 2 },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  value: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  empty: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted, fontStyle: 'italic' },
  issue: { fontFamily: fonts.ui, fontSize: 12, color: colors.danger },
  text: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  valueChip: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.chip, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  valueChipText: { fontFamily: fonts.ui, fontSize: 13, color: colors.text },
});

void Icon;
