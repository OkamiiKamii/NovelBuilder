// Sharing a template as a file (.novel-template.json) and bringing one in: categories & fields, a profile layout or a
// system. Who made it, its terms and its rising version are chosen first, and what the file will hold is shown before
// it is made; a file brought in is read and checked, and what it holds is shown before anything is added. Only new or
// newer versions are added, never over what is there. A port of flutter_app/lib/features/sharing/template_sharing.dart.

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Library } from '../../data/library';
import { putRow } from '../../data/novelStore';
import { CodexChanges, categoriesOf } from '../../domain/codex/codexChanges';
import { type TemplateLicense, TemplateStore, templateLicenseLabel, templateLicenseTerms, templateLicenses } from '../../domain/codex/templates';
import { plural } from '../../domain/desk/format';
import { newId } from '../../domain/ids';
import { type JsonMap, mapOrNull, numOrNull, str } from '../../domain/json';
import { maps } from '../../domain/records/jsonRecord';
import {
  type SharedTemplate,
  type TemplateKind,
  TemplateFileException,
  layoutContent,
  makeSharedTemplate,
  readTemplateFile,
  standingOf,
  systemContent,
  templateKindLabel,
} from '../../domain/sharing/templateFiles';
import { instantiateBlueprint } from '../../domain/systems/blueprints';
import { Sheet } from '../dialogs';
import { Field, GoldButton, Muted, OutlineButton } from '../kit';
import { ChooserField } from '../organize/parts';
import { colors, fonts, space } from '../theme';

const authorKey = 'sharing.author';
const sharedKey = 'sharing.shared';

/** One template that can be shared. `lineage` is the id and version it was received with, for one that came as a file. */
export type TemplateSource = { key: string; kind: TemplateKind; name: string; description: string; content: JsonMap; lineage: JsonMap | null };

const safe = (s: string) =>
  s
    .trim()
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ');

/** The template file's name: "Ember magic.novel-template.json". */
export const templateFileName = (name: string) => `${safe(name).length === 0 ? 'Untitled template' : safe(name)}.novel-template.json`;

/** Everything that can be shared from this device and the open novel. */
export function templateSources(lib: Library, novelId: string | null): TemplateSource[] {
  const saved = new TemplateStore(lib.settings, { createId: newId }).list();
  const novel = novelId === null ? null : lib.novels.novel(novelId);
  const out: TemplateSource[] = saved.map((t) => ({
    key: `template:${t.id}`,
    kind: 'categories',
    name: t.name,
    description: t.description,
    content: { categories: t.categories },
    lineage: t.shared,
  }));
  if (novel === null || novelId === null) return out;
  const schemas = lib.novels.loadPart(novelId, ['loreSchemas']);
  out.push({
    key: `novel-categories:${novelId}`,
    kind: 'categories',
    name: `${novel.title.length === 0 ? 'This novel' : novel.title}: categories & fields`,
    description: '',
    // As the codex shows them: the built-in categories too, until the novel has changed them.
    content: { categories: schemas === null ? [] : [...categoriesOf(schemas).values()].filter((c) => !c.archived).map((c) => CodexChanges.kindTemplate(c)) },
    lineage: null,
  });
  for (const r of lib.novels.rowsIn(novelId, 'characterTemplates')) {
    out.push({ key: `layout:${str(r['id'])}`, kind: 'profileLayout', name: str(r['name'], 'Untitled layout'), description: str(r['description']), content: layoutContent(r), lineage: mapOrNull(r['shared']) });
  }
  for (const r of lib.novels.rowsIn(novelId, 'systems')) {
    out.push({ key: `system:${str(r['id'])}`, kind: 'system', name: str(r['name'], 'Untitled system'), description: str(r['description']), content: systemContent(r), lineage: mapOrNull(r['shared']) });
  }
  return out;
}

function Summary({ lines }: { lines: readonly string[] }) {
  return (
    <View style={styles.gap}>
      {lines.slice(0, 30).map((l, i) => (
        <Text key={i} style={styles.body}>{`• ${l}`}</Text>
      ))}
      {lines.length > 30 && <Text style={styles.body}>{`…and ${lines.length - 30} more.`}</Text>}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------- share

/** Chooses a template and how it is credited, and returns the file to share (and what to remember once shared). */
export function ShareTemplateSheet({
  lib,
  sources,
  onShare,
  onClose,
}: {
  lib: Library;
  sources: readonly TemplateSource[];
  onShare: (made: SharedTemplate, remember: () => void) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState(sources[0]!);
  const [name, setName] = useState(source.name);
  const [description, setDescription] = useState(source.description);
  const [author, setAuthor] = useState(str(lib.settings.read(authorKey)));
  const [license, setLicense] = useState<TemplateLicense>('useAndShare');
  // A template's id is made once, the first time it is shared, and remembered for where it came from.
  const [fresh] = useState(() => new Map<string, string>());
  const [madeAt] = useState(() => Date.now());
  const shared = mapOrNull(lib.settings.read(sharedKey)) ?? {};

  const made = useMemo((): SharedTemplate | string => {
    const from = source.lineage;
    const last = mapOrNull(shared[source.key]);
    let id = str(from?.['id']);
    if (id.length === 0) id = str(last?.['id']);
    if (id.length === 0) {
      if (!fresh.has(source.key)) fresh.set(source.key, newId());
      id = fresh.get(source.key)!;
    }
    const version = Math.trunc(Math.max(numOrNull(from?.['version']) ?? 0, numOrNull(last?.['version']) ?? 0)) + 1;
    try {
      return makeSharedTemplate({ kind: source.kind, id, version, name, description, author, license, now: madeAt, content: source.content, newId });
    } catch (e) {
      if (e instanceof TemplateFileException) return e.message;
      throw e;
    }
  }, [source, name, description, author, license]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (key: string) => {
    const s = sources.find((x) => x.key === key);
    if (!s) return;
    setSource(s);
    setName(s.name);
    setDescription(s.description);
  };
  const remember = (m: SharedTemplate) => () => {
    lib.settings.write(authorKey, m.author);
    lib.settings.write(sharedKey, { ...shared, [source.key]: { id: m.id, version: m.version } });
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Share a template"
      footer={
        <View style={styles.footerRow}>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton
            label="Share the file…"
            icon="share-variant-outline"
            disabled={typeof made === 'string'}
            onPress={() => typeof made !== 'string' && onShare(made, remember(made))}
            style={styles.flex}
          />
        </View>
      }
    >
      <ChooserField label="Template" value={source.key} choices={sources.map((s) => ({ value: s.key, label: `${templateKindLabel[s.kind]}: ${s.name}` }))} onChoose={choose} />
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline />
      <Field
        label="Made by"
        hint="Your name as you want to be credited. It goes in the file; leave it empty to stay unnamed."
        value={author}
        onChangeText={setAuthor}
      />
      <ChooserField
        label="Terms"
        value={license}
        choices={templateLicenses.map((l) => ({ value: l, label: templateLicenseLabel[l] }))}
        onChoose={setLicense}
        helper={templateLicenseTerms[license]}
      />
      <Muted>
        {typeof made === 'string'
          ? `It cannot be shared as it is: ${made}`
          : `Version ${made.version}. Each time you share it again its version goes up, so whoever has an earlier one can tell.`}
      </Muted>
      <Text style={styles.label}>WHAT THE FILE WILL HOLD</Text>
      <Muted>Only these definitions: none of your novel’s entries, text, notes or other records go in it.</Muted>
      {typeof made !== 'string' && <Summary lines={made.summary} />}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------------- import

/** Reads a template file. A string says why it cannot be imported; nothing is added either way. */
export function readTemplate(name: string, text: string): SharedTemplate | string {
  try {
    return readTemplateFile(text, newId);
  } catch (e) {
    if (e instanceof TemplateFileException) return `“${name}”: ${e.message} Nothing was added, and nothing changed.`;
    throw e;
  }
}

/** What a template file holds, who made it, its terms and its version, before anything is added. Adds it on "Add it"
 * and says what was done. */
export function ImportTemplateSheet({
  lib,
  novelId,
  template: t,
  onDone,
  onClose,
}: {
  lib: Library;
  novelId: string | null;
  template: SharedTemplate;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const novel = novelId === null ? null : lib.novels.novel(novelId);
  const templates = new TemplateStore(lib.settings, { createId: newId });
  const lineageOf = (m: JsonMap | null) => (m === null ? [] : [{ id: str(m['id']), version: Math.trunc(numOrNull(m['version']) ?? 1) }]);
  const held =
    t.kind === 'categories'
      ? templates.list().flatMap((s) => lineageOf(s.shared))
      : novelId === null
        ? []
        : lib.novels.rowsIn(novelId, t.kind === 'system' ? 'systems' : 'characterTemplates').flatMap((r) => lineageOf(mapOrNull(r['shared'])));
  const standing = standingOf(t, held);
  const needsNovel = t.kind !== 'categories';
  const where =
    t.kind === 'categories'
      ? 'It is added to your templates, to use in any novel from Categories & fields.'
      : t.kind === 'profileLayout'
        ? novel === null
          ? 'A profile layout goes into a novel: open one first.'
          : `It is added to the profile layouts of “${novel.title}”.`
        : novel === null
          ? 'A system goes into a novel: open one first.'
          : `It is added to “${novel.title}” as a new system. Nothing already there changes.`;

  const add = () => {
    const lineage: JsonMap = { id: t.id, version: t.version, author: t.author, license: t.license, madeAt: t.madeAt };
    const now = Date.now();
    try {
      switch (t.kind) {
        case 'categories':
          templates.saveShared({ name: t.name, description: t.description, categories: maps(t.content['categories']), shared: lineage });
          onDone(`Added “${t.name}” to your templates. Use it from Categories & fields, or when you start a novel.`);
          return;
        case 'profileLayout':
          lib.novels.writeRows(novelId!, [
            putRow('characterTemplates', { id: newId(), projectId: novelId!, name: t.name, description: t.description, createdAt: now, sections: t.content['sections'] ?? null, shared: lineage }, null),
          ]);
          onDone(`Added the profile layout “${t.name}” to “${novel!.title}”.`);
          return;
        case 'system':
          lib.novels.writeRows(novelId!, [
            putRow('systems', { id: newId(), projectId: novelId!, ...instantiateBlueprint(t.content, newId), shared: lineage, createdAt: now, updatedAt: now }, null),
          ]);
          onDone(`Added the system “${t.name}” to “${novel!.title}”.`);
          return;
      }
    } catch (e) {
      onDone(`${e instanceof Error ? e.message : String(e)} Nothing was added.`);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={`${templateKindLabel[t.kind]}: “${t.name}”`}
      footer={
        <View style={styles.footerRow}>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton
            label={standing === 'newer' ? 'Add the newer version' : 'Add it'}
            icon="plus"
            disabled={(needsNovel && novel === null) || standing === 'sameOrOlder'}
            onPress={add}
            style={styles.flex}
          />
        </View>
      }
    >
      {t.description.length > 0 && <Text style={styles.body}>{t.description}</Text>}
      <Muted>{`Made by ${t.author.length === 0 ? 'someone unnamed' : t.author}${t.madeAt > 0 ? ` · ${new Date(t.madeAt).getFullYear()}` : ''} · version ${t.version}`}</Muted>
      <Muted>{`Terms: ${templateLicenseLabel[t.license]}. ${templateLicenseTerms[t.license]}`}</Muted>
      <Text style={styles.body}>
        {standing === 'added'
          ? 'You do not have this template yet.'
          : standing === 'newer'
            ? 'This is a newer version of one you have. The one you have stays as it is.'
            : 'You already have this version of it, or a newer one.'}
      </Text>
      <Text style={styles.body}>{where}</Text>
      {t.leftOut > 0 && (
        <Muted>{`${plural(t.leftOut, 'part')} of the file ${t.leftOut === 1 ? 'was' : 'were'} not template data and ${t.leftOut === 1 ? 'is' : 'are'} left out.`}</Muted>
      )}
      <Text style={styles.label}>WHAT IT HOLDS</Text>
      <Summary lines={t.summary} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The sheet's footer is a row already: this one takes its whole width, or the buttons in it shrink to nothing.
  footerRow: { flex: 1, flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  gap: { gap: 2 },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.gold, marginTop: space.sm },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
});
