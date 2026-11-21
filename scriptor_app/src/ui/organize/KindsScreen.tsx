// CATEGORIES & FIELDS (FEATURES.md #212–#218): where the novel's kinds of record and their field sets are shaped. The
// category chooser, a new category or one from a preset, the chosen category's head (name, what one of them is, colour,
// "Show in the knowledge graph", "Save X as a template"), its fields (name, type, move, archive; choices, Required,
// Lowest and Highest, "Links to", help), what each view reads, the archived fields with Restore, archiving the
// category, and Templates. Nothing an author wrote is ever deleted: a removed field is archived. A port of
// flutter_app/lib/features/codex/kinds_page.dart and widgets/kind_uses_editor.dart; the logic is
// src/domain/codex/screens/{kinds,kindUses}.ts.

import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CodexChanges } from '../../domain/codex/codexChanges';
import {
  addCategory,
  addField,
  addPreset,
  allAsTemplate,
  chosenKind,
  editField,
  entryCount,
  fieldPatch,
  fieldRow,
  fieldsChange,
  kindAsTemplate,
  kindChoiceLabel,
  kindEditor,
  kindPatch,
  kindSaveKey,
  kindsInOrder,
  kindsWords,
  moveField,
  presetAdded,
  saveKind,
  savedTemplateRow,
  templateAdded,
  templateDeleted,
  templateMenu,
} from '../../domain/codex/screens/kinds';
import { chosenField, graphLinkTicked, kindUses, saveUses, setUse, setUseIn, slotMenu, treeTicked, viewState } from '../../domain/codex/screens/kindUses';
import { PageScroll } from '../pageScroll';
import { kindColor } from '../../domain/codex/screens/world';
import { type TemplateSettings, TemplateStore } from '../../domain/codex/templates';
import { typePresets } from '../../domain/codex/typePresets';
import { worldPresets } from '../../domain/codex/worldPresets';
import { newId } from '../../domain/ids';
import type { JsonMap } from '../../domain/json';
import type { Category, FieldDef, FieldType } from '../../domain/records/category';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { ChooserField, SavedText } from './parts';
import { type OpenCast, useCast } from './useCast';

/** The templates kept on this device, saved through autosave like any other setting. */
function useTemplates(): TemplateStore {
  const lib = useLibrary();
  return useMemo(() => {
    const settings: TemplateSettings = {
      read: (key) => lib.settings.read(key),
      write: (key, value) =>
        lib.saves.saveNow(`setting:${key}`, () => {
          lib.settings.write(key, value);
          lib.novels.touchSettings();
        }),
    };
    return new TemplateStore(settings, { createId: newId });
  }, [lib]);
}

export function KindsScreen({ initial }: { initial?: string | null }) {
  const open = useCast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [key, setKey] = useState<string | null>(initial ?? null);
  const [newName, setNewName] = useState('');
  const [presets, setPresets] = useState(false);

  if (!open) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Icon name="book-open-variant" size={40} />
        <Text style={styles.title}>{kindsWords.noNovel}</Text>
        <Muted>{kindsWords.noNovelMessage}</Muted>
        <GoldButton label={kindsWords.goToLibrary} onPress={() => router.navigate('/')} />
      </View>
    );
  }
  const { cast } = open;
  const kinds = kindsInOrder(cast.model.categories.values());
  const kind = chosenKind(kinds, key);
  const add = () => {
    const change = addCategory(newName);
    if (!change) return;
    const made = open.now(change);
    if (made) {
      setNewName('');
      setKey(made.key);
    }
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label={kindsWords.backToWorld} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/organize'))} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {kindsWords.title}
          </Text>
          <Muted numberOfLines={1}>{cast.novelTitle}</Muted>
        </View>
      </View>
      <PageScroll contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ChooserField
          label={kindsWords.category}
          value={kind.key}
          choices={kinds.map((k) => ({ value: k.key, label: kindChoiceLabel(k, entryCount(cast.entries, k)) }))}
          onChoose={setKey}
        />
        <View style={styles.addRow}>
          <View style={styles.flex}>
            <Text style={styles.label}>{kindsWords.newCategory.toUpperCase()}</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={add}
              placeholder={kindsWords.newCategoryHint}
              placeholderTextColor={colors.muted}
              selectionColor={colors.gold}
              cursorColor={colors.gold}
              accessibilityLabel={kindsWords.newCategory}
              style={styles.input}
            />
          </View>
          <OutlineButton label={kindsWords.addCategory} compact onPress={add} disabled={newName.trim().length === 0} />
        </View>
        <OutlineButton
          label={kindsWords.fromPreset}
          icon="shape-plus-outline"
          compact
          tone="muted"
          accessibilityLabel={kindsWords.fromPresetTooltip}
          onPress={() => setPresets(true)}
          style={styles.start}
        />
        <KindEditor key={kind.key} open={open} kind={kind} />
        <Templates open={open} />
      </PageScroll>
      <Sheet visible={presets} onClose={() => setPresets(false)} title={kindsWords.fromPresetTooltip}>
        {typePresets.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => {
              setPresets(false);
              const after = open.now(addPreset(p));
              if (!after) return;
              const said = presetAdded(after, p);
              if (said.show) setKey(said.show);
              toast(said.tell);
            }}
            style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.elevated }]}
          >
            <Text style={styles.menuTitle}>{p.name}</Text>
            <Muted>{p.description}</Muted>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ a category's editor

function KindEditor({ open, kind }: { open: OpenCast; kind: Category }) {
  const toast = useToast();
  const templates = useTemplates();
  const { cast } = open;
  const count = entryCount(cast.entries, kind);
  const view = kindEditor(kind, cast.entries, count);
  const kinds = [...cast.model.categories.values()];

  /** A change of the field set, now or (typing) a moment later. */
  const fields = (change: (stored: JsonMap[]) => JsonMap[], later?: string) => {
    const run = fieldsChange(kind.key, change);
    if (later) open.later(kindSaveKey(kind.key, later), (c) => void run(c));
    else open.now(run);
  };
  const edit = (id: string, patch: JsonMap | null, later?: string) => {
    if (patch === null) return;
    fields((stored) => editField(stored, id, patch), later ? `${id}:${later}` : undefined);
  };

  return (
    <>
      <Panel style={styles.panel}>
        <Text style={styles.kicker}>{view.title.toUpperCase()}</Text>
        {view.caption && <Muted>{view.caption}</Muted>}
        <SavedText
          label={kindsWords.categoryName}
          value={view.name}
          onSave={(v) => {
            const patch = kindPatch.name(v);
            if (patch) open.later(kindSaveKey(kind.key, 'name'), (c) => void saveKind(kind.key, patch)(c));
          }}
        />
        <SavedText
          label={kindsWords.singular}
          value={view.singular}
          onSave={(v) => {
            const patch = kindPatch.singular(v);
            if (patch) open.later(kindSaveKey(kind.key, 'singular'), (c) => void saveKind(kind.key, patch)(c));
          }}
        />
        <Text style={styles.label}>{kindsWords.colour.toUpperCase()}</Text>
        <View style={styles.swatches}>
          {view.colours.map((c) => (
            <Pressable
              key={c.color}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              accessibilityState={{ selected: c.chosen }}
              onPress={() => open.now(saveKind(kind.key, kindPatch.color(c.color)))}
              style={styles.swatchHit}
            >
              <View style={[styles.swatch, { backgroundColor: kindColor({ color: c.color } as Category), borderColor: c.chosen ? colors.text : 'transparent' }]}>
                {c.chosen && <Icon name="check" size={18} color="#FFFFFF" />}
              </View>
            </Pressable>
          ))}
        </View>
        {view.graph && (
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.text}>{kindsWords.graph}</Text>
              <Muted>{kindsWords.graphTooltip}</Muted>
            </View>
            <Switch
              value={view.graph.on}
              onValueChange={(on) => {
                open.now(saveKind(kind.key, kindPatch.graph(on)));
              }}
              trackColor={{ true: colors.gold, false: colors.border }}
              thumbColor={colors.text}
              accessibilityLabel={kindsWords.graph}
            />
          </View>
        )}
        {view.saveTemplate && (
          <OutlineButton
            label={view.saveTemplate}
            icon="bookmark-plus-outline"
            compact
            onPress={() => {
              const t = kindAsTemplate(kind, [CodexChanges.kindTemplate(kind)]);
              const saved = templates.save(t.name, t.description, t.categories);
              toast(t.tell(saved.name));
            }}
            style={styles.start}
          />
        )}
      </Panel>

      <Panel style={styles.panel}>
        <Text style={styles.kicker}>{view.fieldsTitle.toUpperCase()}</Text>
        {view.active.length === 0 && <Muted>{kindsWords.noFields}</Muted>}
        {view.active.map((def, i) => (
          <FieldRow
            key={def.id}
            def={def}
            first={i === 0}
            last={i === view.active.length - 1}
            kinds={kinds}
            edit={edit}
            move={(by) => fields((stored) => moveField(stored, def.id, by))}
          />
        ))}
        <OutlineButton label={kindsWords.addField} icon="plus" compact onPress={() => fields((stored) => addField(stored, newId()))} style={styles.start} />
      </Panel>

      {!view.isCharacter && <KindUsesBox open={open} kind={kind} />}

      {view.archived.length > 0 && (
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{kindsWords.archivedTitle.toUpperCase()}</Text>
          <Muted>{kindsWords.archivedCaption}</Muted>
          {view.archived.map((a) => (
            <View key={a.def.id} style={styles.listRow}>
              <View style={styles.flex}>
                <Text style={styles.text}>{a.title}</Text>
                <Muted>{a.subtitle}</Muted>
              </View>
              <OutlineButton label={kindsWords.restore} compact accessibilityLabel={a.restoreLabel} onPress={() => edit(a.def.id, fieldPatch.restore())} />
            </View>
          ))}
        </Panel>
      )}

      {view.archive && (
        <View style={styles.archive}>
          <Muted style={styles.flex}>{view.archive.said}</Muted>
          <OutlineButton label={view.archive.button} compact tone="muted" onPress={() => open.now(saveKind(kind.key, kindPatch.archived(kind)))} />
        </View>
      )}
    </>
  );
}

function FieldRow({
  def,
  first,
  last,
  kinds,
  edit,
  move,
}: {
  def: FieldDef;
  first: boolean;
  last: boolean;
  kinds: Category[];
  edit: (id: string, patch: JsonMap | null, later?: string) => void;
  move: (by: number) => void;
}) {
  const row = fieldRow(def, { first, last, kinds });
  return (
    <View style={styles.fieldCard}>
      <SavedText label={kindsWords.fieldName} value={row.name} onSave={(v) => edit(row.id, fieldPatch.name(v), 'name')} />
      <View style={styles.typeRow}>
        <View style={styles.flex}>
          <ChooserField<FieldType> label={kindsWords.type} value={row.type} choices={row.types} onChoose={(t) => edit(row.id, fieldPatch.type(t))} />
        </View>
        <IconButton icon="arrow-up" label={row.up.tooltip} onPress={() => row.up.enabled && move(-1)} color={row.up.enabled ? colors.text : colors.border} />
        <IconButton icon="arrow-down" label={row.down.tooltip} onPress={() => row.down.enabled && move(1)} color={row.down.enabled ? colors.text : colors.border} />
        <IconButton icon="archive-outline" label={row.archiveTooltip} onPress={() => edit(row.id, fieldPatch.archive())} />
      </View>
      {row.choices !== null && <SavedText label={kindsWords.choices} value={row.choices} onSave={(v) => edit(row.id, fieldPatch.options(v), 'options')} />}
      <View style={styles.chips}>
        <Chip label={kindsWords.required} icon={row.required ? 'check' : undefined} selected={row.required} onPress={() => edit(row.id, fieldPatch.required(!row.required))} />
      </View>
      <Muted>{kindsWords.requiredTooltip}</Muted>
      {row.numbers && (
        <View style={styles.twoUp}>
          <View style={styles.flex}>
            <SavedText label={kindsWords.lowest} value={row.numbers.min} keyboardType="numeric" onSave={(v) => edit(row.id, fieldPatch.min(v), 'min')} />
          </View>
          <View style={styles.flex}>
            <SavedText label={kindsWords.highest} value={row.numbers.max} keyboardType="numeric" onSave={(v) => edit(row.id, fieldPatch.max(v), 'max')} />
          </View>
        </View>
      )}
      {row.linksTo && <ChooserField label={kindsWords.linksTo} value={row.linksTo.value} choices={row.linksTo.choices} onChoose={(v) => edit(row.id, fieldPatch.target(v))} />}
      <SavedText label={kindsWords.help} value={row.help} onSave={(v) => edit(row.id, fieldPatch.help(v), 'help')} />
    </View>
  );
}

// ------------------------------------------------------------------------------------------- what each view reads

function KindUsesBox({ open, kind }: { open: OpenCast; kind: Category }) {
  const box = kindUses(kind, open.cast.model.links);
  const save = (change: (stored: JsonMap) => JsonMap) => open.now(saveUses(kind.key, change));
  const pick = (menu: ReturnType<typeof slotMenu>, onPick: (v: string | null) => void) => (
    <ChooserField label={menu.label} value={menu.value} choices={menu.choices} onChoose={(v) => onPick(chosenField(v))} />
  );
  const note = (text: string) => <Muted>{text}</Muted>;
  const state = (s: ReturnType<typeof viewState>) =>
    s.kind === 'note' ? (
      <Muted>{s.text}</Muted>
    ) : (
      <Issues items={s.items} />
    );
  const group = (title: string, children: ReactNode) => (
    <View style={styles.group} accessible={false} accessibilityLabel={title}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
  return (
    <Panel style={styles.panel}>
      <Text style={styles.kicker}>{box.title.toUpperCase()}</Text>
      <Muted>{box.caption}</Muted>
      {group(
        'On a timeline',
        <>
          {pick(box.timeline.start, (v) => save(setUseIn('timeline', 'start', v)))}
          {pick(box.timeline.end, (v) => save(setUseIn('timeline', 'end', v)))}
          {note('A Number is a year of the story’s calendar; a Date is a day.')}
          {state(box.timeline.state)}
        </>,
      )}
      {group(
        'On a map',
        <>
          {pick(box.map.x, (v) => save(setUseIn('map', 'x', v)))}
          {pick(box.map.y, (v) => save(setUseIn('map', 'y', v)))}
          {state(box.map.state)}
        </>,
      )}
      {group(
        'By rank',
        <>
          {pick(box.rank.menu, (v) => save(setUse('rank', v)))}
          {note('A Choice (one) ranks by the order of its choices, lowest first.')}
          {state(box.rank.state)}
        </>,
      )}
      {group(
        'By who holds it',
        <>
          <ChooserField
            label="Connection that means holding it"
            value={box.ownership.holding.value}
            choices={box.ownership.holding.choices}
            onChoose={(v) => save(setUseIn('ownership', 'type', chosenField(v)))}
          />
          {pick(box.ownership.field, (v) => save(setUseIn('ownership', 'field', v)))}
          {note('A holder is the record a connection of this type comes from: “Mira owns the Ember Crown”.')}
          {state(box.ownership.state)}
        </>,
      )}
      {group(
        'In the ability tree',
        <>
          <Tick label="Its records are abilities, skills, classes or the like" on={box.tree} onPress={() => save(treeTicked(!box.tree))} />
          {note(
            'Kept for the Ability paths view in Visualize, with the paths you record between them: prerequisites, upgrades, ' +
              'evolutions, fusions, replacements, exclusions.',
          )}
        </>,
      )}
      {group(
        'In the knowledge graph',
        <>
          {pick(box.graph.label, (v) => save(setUse('graphLabel', v)))}
          {box.graph.links.length > 0 && (
            <>
              <Muted>Link fields drawn as connections:</Muted>
              {box.graph.links.map((l) => (
                <Tick key={l.id} label={l.name} accessibilityLabel={l.label} on={l.on} onPress={() => save(graphLinkTicked(kind, l.id, !l.on))} />
              ))}
            </>
          )}
          {box.graph.issues.length > 0 && <Issues items={box.graph.issues} />}
        </>,
      )}
    </Panel>
  );
}

function Tick({ label, on, onPress, accessibilityLabel }: { label: string; on: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.tick, pressed && { backgroundColor: colors.elevated }]}
    >
      <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={on ? colors.gold : colors.muted} />
      <Text style={[styles.text, styles.flex]}>{label}</Text>
    </Pressable>
  );
}

function Issues({ items }: { items: string[] }) {
  return (
    <View style={styles.gapXs}>
      {items.map((m) => (
        <View key={m} style={styles.issue}>
          <Icon name="information-outline" size={16} color={colors.danger} />
          <Text style={styles.issueText}>{m}</Text>
        </View>
      ))}
    </View>
  );
}

// -------------------------------------------------------------------------------------------------------- templates

function Templates({ open }: { open: OpenCast }) {
  const toast = useToast();
  const templates = useTemplates();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const saved = templates.list();
  const menu = templateMenu(worldPresets, saved);

  const save = () => {
    if (name.trim().length === 0) return;
    const data = open.now((c) => c.schemaSnapshot());
    if (!data) return;
    const said = allAsTemplate(data);
    try {
      const t = templates.save(name, said.description, data);
      setName('');
      toast(said.tell(t.name));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
    }
  };
  const apply = (n: string, categories: readonly JsonMap[]) => {
    const after = open.now((c) => c.addKinds(categories));
    if (after) toast(templateAdded(n));
  };

  return (
    <Panel style={styles.panel}>
      <Text style={styles.kicker}>{kindsWords.templates.toUpperCase()}</Text>
      <View style={styles.addRow}>
        <View style={styles.flex}>
          <Text style={styles.label}>{kindsWords.templateName.toUpperCase()}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={save}
            placeholder={kindsWords.templateNameHint}
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            cursorColor={colors.gold}
            accessibilityLabel={kindsWords.templateName}
            style={styles.input}
          />
        </View>
        <GoldButton label={kindsWords.saveTemplate} compact disabled={name.trim().length === 0} onPress={save} />
      </View>
      <OutlineButton
        label={kindsWords.addFromTemplate}
        icon="playlist-plus"
        compact
        tone="muted"
        accessibilityLabel={kindsWords.addFromTemplateTooltip}
        onPress={() => setAdding(true)}
        style={styles.start}
      />
      {saved.length > 0 && (
        <>
          <Text style={styles.label}>{kindsWords.yourTemplates.toUpperCase()}</Text>
          {saved.map((t) => {
            const row = savedTemplateRow(t);
            return (
              <View key={row.id} style={styles.listRow}>
                <View style={styles.flex}>
                  <Text style={styles.text}>{row.title}</Text>
                  {row.subtitle.length > 0 && <Muted>{row.subtitle}</Muted>}
                </View>
                <OutlineButton
                  label={kindsWords.delete}
                  compact
                  tone="danger"
                  accessibilityLabel={row.deleteLabel}
                  onPress={() => {
                    templates.remove(t.id);
                    toast(templateDeleted(t.name));
                  }}
                />
              </View>
            );
          })}
        </>
      )}
      <Sheet visible={adding} onClose={() => setAdding(false)} title={kindsWords.addFromTemplateTooltip}>
        {menu.map((g) => (
          <View key={g.heading} style={styles.gapXs}>
            <Text style={styles.label}>{g.heading.toUpperCase()}</Text>
            {g.items.map((item, i) => (
              <Pressable
                key={`${g.heading}:${i}`}
                accessibilityRole="button"
                onPress={() => {
                  setAdding(false);
                  apply(item.name, item.categories);
                }}
                style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.elevated }]}
              >
                <Text style={styles.menuTitle}>{item.name}</Text>
                {item.description.length > 0 && <Muted>{item.description}</Muted>}
              </Pressable>
            ))}
          </View>
        ))}
      </Sheet>
    </Panel>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  gapXs: { gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  body: { padding: space.md, gap: space.md, maxWidth: 820, width: '100%', alignSelf: 'center', paddingBottom: space.xxl },
  panel: { gap: space.sm },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  label: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.muted },
  text: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  input: {
    minHeight: 48,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
    marginTop: 4,
  },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  swatchHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  fieldCard: { gap: space.sm, padding: space.md, borderRadius: 10, backgroundColor: colors.elevated },
  typeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  twoUp: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52 },
  archive: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  group: { gap: space.sm, marginTop: space.sm },
  groupTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  tick: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, borderRadius: 6 },
  issue: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  issueText: { flex: 1, fontFamily: fonts.ui, fontSize: 13, color: colors.danger },
  menuItem: { paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: 8, gap: 2 },
  menuTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
});
