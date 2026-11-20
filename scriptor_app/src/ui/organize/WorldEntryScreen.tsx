// AN ENTRY OF THE WORLD (FEATURES.md #208–#211): its picture, name (with Forge a name), category (moving keeps every
// value) and summary; its description; the category's fields with what fits each said (never enforced); fields just
// for this entry; tags; related entries with each side's wording and canon status; where it figures; "In its pages";
// its connections; private notes; delete with a restore point and Undo. Every field saves itself; nothing here writes
// to the manuscript. A port of flutter_app/lib/features/codex/entry_page.dart; the logic is
// src/domain/codex/screens/entryPage.ts.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickCoverPicture } from '../../data/files';
import { sightingsJob } from '../../domain/characters/namedIn';
import { characterPath } from '../../domain/characters/screens/create';
import { isUploadedImage } from '../../domain/characters/screens/profile';
import { theirPages, theirPagesInputs } from '../../domain/characters/screens/theirPages';
import { inkOn } from '../../domain/characters/views/common';
import { CodexService } from '../../domain/codex/codexService';
import { splitChoices } from '../../domain/codex/fieldValues';
import {
  autosaveKeys,
  choicesTyped,
  deleteDialog,
  deleteWords,
  entryEdits,
  entryHead,
  entryWords,
  fieldValueSet,
  kindFields,
  nameTyped,
  ownFieldAdded,
  ownFieldEdited,
  ownFieldRemoved,
  ownFieldRow,
  ownFieldRows,
  ownFieldsNote,
  ownFieldsSaved,
  ownFieldWords,
  relatedEdits,
  relatedEntries,
  relatedWords,
  removePictureDialog,
  webPictureNote,
  whereItFigures,
  worldEntryPath,
} from '../../domain/codex/screens/entryPage';
import { entryThumb } from '../../domain/codex/screens/world';
import { newId } from '../../domain/ids';
import { EntityRef } from '../../domain/model/entityRef';
import type { CanonStatus } from '../../domain/records/canon';
import { Category, type FieldType } from '../../domain/records/category';
import type { Entry } from '../../domain/records/entry';
import type { JsonMap } from '../../domain/json';
import { lastNodeSetting } from '../write/WriteScreen';
import { ConfirmDelete } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { NameForgeSheet } from './AidsSheets';
import { ConnectionsPanel } from './ConnectionsPanel';
import { ChooserField, DateField, SavedText } from './parts';
import { type OpenCast, useCast } from './useCast';

/** The kinds page lives at /organize/kinds here (the Flutter app's /organize/world/kinds). */
const kindsPath = (path: string) => path.replace('/organize/world/kinds', '/organize/kinds');

export function WorldEntryScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const open = useCast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const lib = useLibrary();
  const phone = sizeClassOf(useWindowDimensions().width) === 'compact';
  const service = useMemo(() => new CodexService(lib.novels, lib.backups), [lib]);
  const [forging, setForging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [all, setAll] = useState(false);

  const entry = open && params.id ? (open.cast.model.entries.get(params.id) ?? null) : null;
  // Where its names first come in each chapter: read from the saved chapters.
  const found = useMemo(() => {
    if (!open || !entry) return null;
    const inputs = theirPagesInputs(open.cast, entry.id);
    return inputs ? sightingsJob(open.service.storedChapters(open.novelId), inputs.where, inputs.names)() : null;
  }, [open, entry]);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/organize'));

  if (!open || !entry) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{entryWords.notFound}</Text>
        <Muted style={styles.centerText}>{open ? entryWords.notFoundGone : entryWords.notFoundNoNovel}</Muted>
        {open ? (
          <OutlineButton label={entryWords.back} icon="arrow-left" onPress={() => router.navigate('/organize')} />
        ) : (
          <GoldButton label={entryWords.goLibrary} icon="book-open-page-variant-outline" onPress={() => router.navigate('/')} />
        )}
      </View>
    );
  }
  // A character's address here goes to its profile.
  if (entry.category === 'character') return <Redirect href={characterPath(entry.id) as never} />;

  const { cast } = open;
  const kind = cast.model.categories.get(entry.category) ?? Category.unknown(entry.category);
  const head = entryHead(cast, entry, kind);
  const uploaded = isUploadedImage(entry.image);
  const webNote = webPictureNote(entry.image, uploaded);
  const fields = kindFields(cast, entry, kind);
  const related = relatedEntries(cast, entry);
  const where = whereItFigures(cast, entry);
  const pages = theirPages(cast, found, all, entryWords.inItsPages);
  const id = entry.id;

  const openChapter = (nodeId: string) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(open.novelId)}`, () => lib.settings.write(lastNodeSetting(open.novelId), nodeId));
    router.navigate('/write');
  };
  const upload = async () => {
    try {
      const picture = await pickCoverPicture();
      if (picture) open.now(entryEdits.picture(id, picture));
    } catch (e) {
      toast(`The picture could not be read (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };
  const remove = () => {
    setDeleting(false);
    try {
      const point = service.delete(open.novelId, id, { name: entry.name });
      router.navigate('/organize');
      toast(deleteWords.deleted(entry.name), {
        action: {
          label: deleteWords.undo,
          run: () => {
            service.undoDelete(point);
            router.navigate(worldEntryPath(id) as never);
          },
        },
      });
    } catch (e) {
      toast(deleteWords.failed(e), { error: true });
    }
  };
  const asked = deleting ? deleteDialog(service.references(open.novelId, id), entry, kind) : null;
  const removePicture = removePictureDialog(entry);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-left" label={entryWords.back} onPress={back} />
        <View style={styles.flex}>
          <Text style={styles.barTitle} numberOfLines={1}>
            {head.title}
          </Text>
          <Text style={styles.barSub} numberOfLines={1}>
            {head.subtitle}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        {/* The head: picture, name, category, summary. */}
        <Panel style={[styles.panel, !phone && styles.headWide]}>
          <View style={styles.pictureCol}>
            <EntryPicture entry={entry} tone={head.tone} initial={head.initial} uploaded={uploaded} label={head.pictureLabel} size={96} />
            {webNote && <Muted style={styles.small}>{webNote}</Muted>}
            <OutlineButton label={head.upload} icon="image-plus" compact tone="muted" onPress={() => void upload()} />
            {head.canRemove && <OutlineButton label={removePicture.confirm} icon="image-remove" compact tone="muted" onPress={() => setRemoving(true)} />}
          </View>
          <View style={styles.headFields}>
            <SavedText
              label={entryWords.nameLabel}
              value={entry.name}
              onSave={(v) => {
                const change = nameTyped(id, v);
                if (change) open.later(autosaveKeys.name(id), change);
              }}
            />
            <OutlineButton label={entryWords.forge} icon="auto-fix" compact tone="muted" onPress={() => setForging(true)} style={styles.start} />
            <ChooserField
              label={entryWords.category}
              value={entry.category}
              choices={head.categories}
              helper={entryWords.categoryHelper}
              onChoose={(key) => {
                const change = entryEdits.category(entry, key);
                if (change) open.now(change);
              }}
            />
            <SavedText
              label={entryWords.summary}
              value={entry.summary}
              hint={entryWords.summaryHint}
              multiline
              minLines={2}
              onSave={(v) => open.later(autosaveKeys.summary(id), entryEdits.summary(id, v))}
            />
          </View>
        </Panel>

        <Panel style={styles.panel}>
          <SavedText
            label={entryWords.description}
            value={entry.description}
            multiline
            minLines={5}
            onSave={(v) => open.later(autosaveKeys.description(id), entryEdits.description(id, v))}
          />
        </Panel>

        {/* The category's fields, with what fits each said. */}
        <Panel style={styles.panel}>
          <View style={styles.headRow}>
            <Text style={[styles.kicker, styles.flex]}>{fields.title.toUpperCase()}</Text>
            <OutlineButton label={fields.edit} icon="tune-variant" compact tone="muted" onPress={() => router.navigate(kindsPath(fields.editPath) as never)} />
          </View>
          {fields.empty && <Muted>{fields.empty}</Muted>}
          {fields.rows.map((r) => (
            <View key={r.key} style={styles.field}>
              <TypedValue
                label={r.label}
                type={r.type}
                value={r.value}
                options={r.options}
                entries={r.entries}
                onType={(v) => open.later(autosaveKeys.value(id, r.def.id), fieldValueSet(id, r.def.id, v))}
                onChoose={(v) => open.now(fieldValueSet(id, r.def.id, v))}
              />
              {r.helper && !r.error && <Muted style={styles.helper}>{r.helper}</Muted>}
              {r.error && <Text style={styles.error}>{r.error}</Text>}
            </View>
          ))}
          {fields.archived && <ArchivedFields archived={fields.archived} />}
        </Panel>

        <OwnFields open={open} entry={entry} kind={kind} />

        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{entryWords.tags.toUpperCase()}</Text>
          <SavedText label={entryWords.tagsLabel} value={entry.tags.join(', ')} onSave={(v) => open.later(autosaveKeys.tags(id), entryEdits.tags(id, v))} />
        </Panel>

        <Related open={open} entry={entry} related={related} />

        {/* Where it figures. */}
        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{where.title.toUpperCase()}</Text>
          {where.empty && <Muted>{where.empty}</Muted>}
          {where.chapters && (
            <>
              <Text style={styles.text}>{where.chapters.heading}</Text>
              <View style={styles.row}>
                {where.chapters.items.map((c) => (
                  <Chip key={c.id} label={c.name} icon="book-open-page-variant-outline" selected={false} onPress={() => openChapter(c.id)} />
                ))}
              </View>
            </>
          )}
          {where.events && <Text style={styles.text}>{where.events}</Text>}
          {where.threads && <Text style={styles.text}>{where.threads}</Text>}
        </Panel>

        {pages && (
          <Panel style={styles.panel}>
            <Text style={styles.kicker}>{pages.title.toUpperCase()}</Text>
            <Muted>{pages.caption}</Muted>
            {pages.passages.map((p, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                onPress={() => openChapter(p.sighting.nodeId)}
                style={({ pressed }) => [styles.passage, pressed && { backgroundColor: colors.elevated }]}
              >
                <Text style={styles.passageWhere}>{p.chapter}</Text>
                <Text style={styles.quote}>
                  {p.quote.before}
                  <Text style={styles.quoteName}>{p.quote.name}</Text>
                  {p.quote.after}
                </Text>
              </Pressable>
            ))}
            {pages.toggle && <OutlineButton label={pages.toggle} compact tone="muted" onPress={() => setAll(!all)} style={styles.start} />}
          </Panel>
        )}

        <ConnectionsPanel open={open} self={new EntityRef('entry', id)} />

        <Panel style={styles.panel}>
          <Text style={styles.kicker}>{entryWords.notes.toUpperCase()}</Text>
          <SavedText
            label={entryWords.notesLabel}
            value={entry.notes}
            hint={entryWords.notesHint}
            multiline
            minLines={3}
            onSave={(v) => open.later(autosaveKeys.notes(id), entryEdits.notes(id, v))}
          />
        </Panel>

        <Muted>{entryWords.reference}</Muted>
        <OutlineButton label={entryWords.delete} icon="delete-outline" compact tone="danger" onPress={() => setDeleting(true)} style={styles.start} />
      </ScrollView>

      {forging && (
        <NameForgeSheet
          open={open}
          place={head.forge.place}
          onClose={() => setForging(false)}
          onPick={(name) => {
            setForging(false);
            open.now(entryEdits.forged(id, name));
          }}
        />
      )}
      <ConfirmDelete
        visible={removing}
        title={removePicture.title}
        message={removePicture.message}
        confirmLabel={removePicture.confirm}
        onConfirm={() => {
          setRemoving(false);
          open.now(entryEdits.picture(id, null));
        }}
        onClose={() => setRemoving(false)}
      />
      {asked && (
        <ConfirmDelete visible title={asked.title} message={asked.message} confirmLabel={asked.confirm} onConfirm={remove} onClose={() => setDeleting(false)} />
      )}
    </View>
  );
}

/** EntryThumb: an uploaded picture, or the initial on the kind's colour. */
function EntryPicture({ entry, tone, initial, uploaded, label, size }: { entry: Entry; tone: string; initial: string; uploaded: boolean; label: string; size: number }) {
  const corner = size * entryThumb.corner;
  return (
    <View accessibilityLabel={label} style={[styles.thumb, { width: size, height: size, borderRadius: corner, backgroundColor: tone }]}>
      {uploaded ? (
        <Image source={{ uri: entry.image ?? undefined }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Text style={{ fontFamily: fonts.ui, fontWeight: '600', fontSize: size * entryThumb.letter, color: inkOn(tone) }}>{initial}</Text>
      )}
    </View>
  );
}

/** A value written in its field's own way: typed (saved a moment later) or chosen (saved at once). */
export function TypedValue({
  label,
  type,
  value,
  options,
  entries,
  onType,
  onChoose,
}: {
  label: string;
  type: FieldType;
  value: string;
  options: readonly string[];
  entries: readonly Entry[];
  onType: (v: string) => void;
  onChoose: (v: string) => void;
}) {
  switch (type) {
    case 'date':
      return <DateField label={label} value={value} onSave={onType} onChosen={onChoose} />;
    case 'toggle':
      return (
        <View>
          <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
          <View style={styles.row}>
            <Chip label="Yes" selected={value === 'yes'} onPress={() => onChoose(value === 'yes' ? '' : 'yes')} />
            <Chip label="No" selected={value === 'no'} onPress={() => onChoose(value === 'no' ? '' : 'no')} />
          </View>
        </View>
      );
    case 'select':
      return (
        <ChooserField
          label={label}
          value={value}
          choices={[{ value: '', label: '—' }, ...options.map((o) => ({ value: o, label: o })), ...(value && !options.includes(value) ? [{ value, label: value }] : [])]}
          onChoose={onChoose}
        />
      );
    case 'multiselect':
    case 'references': {
      const chosen = splitChoices(value);
      const items = type === 'multiselect' ? options.map((o) => ({ key: o, label: o })) : entries.map((e) => ({ key: e.id, label: e.name }));
      return (
        <View>
          <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
          <View style={styles.row}>
            {items.map((it) => {
              const on = chosen.includes(it.key);
              return (
                <Chip key={it.key} label={it.label} selected={on} onPress={() => onChoose((on ? chosen.filter((x) => x !== it.key) : [...chosen, it.key]).join('\n'))} />
              );
            })}
            {items.length === 0 && <Muted>—</Muted>}
          </View>
        </View>
      );
    }
    case 'reference':
      return (
        <ChooserField
          label={label}
          value={value}
          choices={[{ value: '', label: '—' }, ...entries.map((e) => ({ value: e.id, label: e.name }))]}
          onChoose={onChoose}
        />
      );
    case 'tags':
      return (
        <SavedText
          label={label}
          value={splitChoices(value).join(', ')}
          hint="Comma separated"
          onSave={(v) =>
            onType(
              v
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
                .join('\n'),
            )
          }
        />
      );
    default:
      return (
        <SavedText
          label={label}
          value={value}
          multiline={type === 'longtext'}
          minLines={type === 'longtext' ? 4 : 1}
          keyboardType={type === 'number' ? 'numeric' : undefined}
          onSave={onType}
        />
      );
  }
}

function ArchivedFields({ archived }: { archived: { heading: string; fields: { name: string; value: string }[]; note: string } }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.archived}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: shown }} onPress={() => setShown(!shown)} style={styles.headRow}>
        <Icon name={shown ? 'chevron-down' : 'chevron-right'} size={20} color={colors.muted} />
        <Text style={[styles.text, styles.flex]}>{archived.heading}</Text>
      </Pressable>
      {shown && (
        <>
          {archived.fields.map((f, i) => (
            <View key={i} style={styles.archivedField}>
              <Text style={styles.fieldLabel}>{f.name}</Text>
              <Text style={styles.text}>{f.value}</Text>
            </View>
          ))}
          <Muted>{archived.note}</Muted>
        </>
      )}
    </View>
  );
}

/** "Fields just for this entry": rows edited here and saved as a whole (typing a moment later, the rest at once). */
function OwnFields({ open, entry, kind }: { open: OpenCast; entry: Entry; kind: Category }) {
  const [rows, setRows] = useState<JsonMap[]>(() => ownFieldRows(open.cast, entry, kind));
  useEffect(() => {
    setRows(ownFieldRows(open.cast, entry, kind));
    // Read again only when another entry is shown: what is typed here stays while it saves.
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const id = entry.id;
  const typed = (next: JsonMap[]) => {
    setRows(next);
    open.later(autosaveKeys.ownFields(id), ownFieldsSaved(id, next));
  };
  const now = (next: JsonMap[]) => {
    setRows(next);
    open.now(ownFieldsSaved(id, next));
  };
  const note = ownFieldsNote(rows);
  return (
    <Panel style={styles.panel}>
      <Text style={styles.kicker}>{entryWords.own.toUpperCase()}</Text>
      {rows.map((raw, i) => {
        const r = ownFieldRow(raw);
        return (
          <View key={r.id} style={styles.ownRow}>
            <View style={styles.headRow}>
              <View style={styles.flex}>
                <SavedText label={ownFieldWords.name} value={r.name} onSave={(v) => typed(ownFieldEdited(rows, i, { key: v }))} />
              </View>
              <IconButton icon="close" label={r.removeTip} onPress={() => now(ownFieldRemoved(rows, i))} color={colors.muted} />
            </View>
            <ChooserField label={ownFieldWords.type} value={r.type} choices={r.types} onChoose={(t) => now(ownFieldEdited(rows, i, { type: t }))} />
            {r.choices !== null && (
              <SavedText label={ownFieldWords.choices} value={r.choices} onSave={(v) => typed(ownFieldEdited(rows, i, { options: choicesTyped(v) }))} />
            )}
            <TypedValue
              label={r.valueLabel}
              type={r.type}
              value={r.value}
              options={r.options}
              entries={open.cast.entries.filter((e) => e.id !== id)}
              onType={(v) => typed(ownFieldEdited(rows, i, { value: v }))}
              onChoose={(v) => now(ownFieldEdited(rows, i, { value: v }))}
            />
          </View>
        );
      })}
      {note && <Muted>{note}</Muted>}
      <OutlineButton label={ownFieldWords.add} icon="plus" compact tone="muted" onPress={() => setRows(ownFieldAdded(rows, newId))} style={styles.start} />
    </Panel>
  );
}

/** "Related entries": each linked one with its wording and status; then Link to… */
function Related({ open, entry, related }: { open: OpenCast; entry: Entry; related: ReturnType<typeof relatedEntries> }) {
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [label, setLabel] = useState('');
  const id = entry.id;
  const link = () => {
    if (!target) return;
    open.now(relatedEdits.link(id, target, label));
    setTarget('');
    setLabel('');
  };
  return (
    <Panel style={styles.panel}>
      <Text style={styles.kicker}>{related.title.toUpperCase()}</Text>
      {related.empty && <Muted>{related.empty}</Muted>}
      {related.rows.map((r) => (
        <View key={r.linkId} style={styles.relRow}>
          <View style={styles.headRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={r.entry.name}
              onPress={() => router.navigate((r.character ? characterPath(r.entry.id) : worldEntryPath(r.entry.id)) as never)}
              style={[styles.flex, styles.relName]}
            >
              <View style={[styles.dot, { backgroundColor: r.tone }]} />
              <View style={styles.flex}>
                <Text style={styles.relTitle} numberOfLines={1}>
                  {r.entry.name}
                </Text>
                <Text style={styles.relKind}>{r.kind}</Text>
              </View>
            </Pressable>
            <IconButton icon="link-variant-off" label={r.unlinkTip} onPress={() => open.now(relatedEdits.unlink(r.linkId))} color={colors.muted} />
          </View>
          <SavedText
            label={relatedWords.relationship}
            value={r.label}
            hint={r.hint ?? undefined}
            onSave={(v) => open.later(autosaveKeys.linkLabel(r.linkId), relatedEdits.label(r.linkId, id, v))}
          />
          <ChooserField<CanonStatus>
            label={relatedWords.status}
            value={r.canon}
            choices={related.statuses}
            onChoose={(s) => open.now(relatedEdits.canon(r.linkId, s))}
          />
        </View>
      ))}
      {related.linkable.length > 0 && (
        <View style={styles.linkForm}>
          <ChooserField label={relatedWords.linkTo} value={target} choices={[{ value: '', label: '—' }, ...related.linkable]} onChoose={setTarget} />
          <Text style={styles.fieldLabel}>{relatedWords.optional.toUpperCase()}</Text>
          <LinkLabelInput value={label} onChange={setLabel} />
          <GoldButton label={relatedWords.link} icon="link-variant" compact disabled={!target} onPress={link} style={styles.start} />
        </View>
      )}
    </Panel>
  );
}


function LinkLabelInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholderTextColor={colors.muted}
      selectionColor={colors.gold}
      accessibilityLabel={relatedWords.optional}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  centerText: { textAlign: 'center' },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
  barTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  barSub: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.2, color: colors.gold },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textAlign: 'center' },
  body: { padding: space.md, gap: space.md, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  panel: { gap: space.sm },
  headWide: { flexDirection: 'row', gap: 20 },
  pictureCol: { alignItems: 'center', gap: space.sm },
  headFields: { flex: 1, maxWidth: 560, gap: space.sm },
  thumb: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  small: { fontSize: 12, maxWidth: 160, textAlign: 'center' },
  start: { alignSelf: 'flex-start' },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  text: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  field: { gap: 2 },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.2, color: colors.muted, marginBottom: 4 },
  helper: { fontSize: 12 },
  error: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger },
  archived: { marginTop: space.sm, gap: space.sm },
  archivedField: { paddingLeft: space.lg },
  ownRow: { gap: space.xs, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  relRow: { gap: space.xs, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  relName: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  relTitle: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text },
  relKind: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  dot: { width: 10, height: 10, borderRadius: 5 },
  linkForm: { gap: space.xs, marginTop: space.sm },
  input: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.field, backgroundColor: colors.elevated, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  passage: { paddingVertical: space.sm, paddingHorizontal: space.sm, borderLeftWidth: 3, borderLeftColor: colors.gold, borderRadius: 4, gap: 2 },
  passageWhere: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  quote: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 23, color: colors.text },
  quoteName: { color: colors.gold },
});
