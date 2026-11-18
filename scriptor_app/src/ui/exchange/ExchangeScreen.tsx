// IMPORT & EXPORT: the hub for getting writing in and out. Export the manuscript (Word, PDF, Markdown, plain text or a
// web page), import a manuscript (.txt, .md, .docx, .rtf), export records (JSON or CSV, "not a backup"), share and
// import template files, and the full backup. Everything is made on this device; each file goes only where the author
// chooses. A port of flutter_app/lib/features/exchange/exchange_page.dart.

import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackupService, type ImportPreview } from '../../data/backupService';
import { ExchangeService } from '../../data/exchangeService';
import { pickTextFile, shareBytesFile, shareTextFile } from '../../data/files';
import { openNovelSettingKey } from '../../data/settingsStore';
import { ReviewMark } from '../../domain/collab/reviewFiles';
import type { ImportBlock } from '../../domain/exchange/importParse';
import type { SharedTemplate } from '../../domain/sharing/templateFiles';
import { SnapshotError } from '../../domain/snapshot/novelSnapshot';
import { openReviewCopy } from '../collab/useCollab';
import { type IconName, GoldButton, Muted, OutlineButton, Panel, SectionTitle } from '../kit';
import { ImportSheet } from '../library/LibrarySheets';
import { useOpenNovel } from '../organize/useNovel';
import { PlanPage } from '../plan/PlanPage';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { lastNodeSetting } from '../write/WriteScreen';
import { DataExportSheet } from './DataExportSheet';
import { ExportManuscriptSheet, ImportManuscriptSheet, pickManuscript } from './ManuscriptSheets';
import { ImportTemplateSheet, ShareTemplateSheet, type TemplateSource, readTemplate, templateFileName, templateSources } from './TemplateSheets';
import { useLibrary } from '../LibraryContext';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Open =
  | { sheet: 'export' }
  | { sheet: 'import'; name: string; blocks: ImportBlock[] }
  | { sheet: 'records' }
  | { sheet: 'share'; sources: TemplateSource[] }
  | { sheet: 'template'; template: SharedTemplate }
  | { sheet: 'backup'; preview: ImportPreview };

function Section({ icon, title, about, children }: { icon: IconName; title: string; about: string; children: ReactNode }) {
  return (
    <Panel style={styles.block}>
      <SectionTitle icon={icon} title={title} />
      <Text style={styles.body}>{about}</Text>
      <View style={styles.buttons}>{children}</View>
    </Panel>
  );
}

export function ExchangeScreen() {
  const lib = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const open = useOpenNovel();
  const [sheet, setSheet] = useState<Open | null>(null);
  const exchange = useMemo(() => new ExchangeService(lib.novels), [lib]);
  const novelId = open?.novelId ?? null;
  const title = open?.model.novel.title ?? '';
  const close = () => setSheet(null);
  const attempt = (run: () => void, failed: string) => {
    try {
      run();
    } catch (e) {
      toast(`${failed} (${message(e)}).`, { error: true });
    }
  };

  const importManuscript = async () => {
    try {
      const picked = await pickManuscript(exchange);
      if (picked === null) return;
      if ('refused' in picked) toast(picked.refused, { error: true });
      else setSheet({ sheet: 'import', name: picked.name, blocks: picked.blocks });
    } catch (e) {
      toast(`The file could not be read (${message(e)}). Nothing was imported.`, { error: true });
    }
  };
  const shareTemplate = () => {
    const sources = templateSources(lib, novelId);
    if (sources.length === 0) toast('There is nothing to share yet: save a template in Categories & fields, or open a novel.');
    else setSheet({ sheet: 'share', sources });
  };
  const importTemplate = async () => {
    try {
      const file = await pickTextFile();
      if (file === null) return;
      const read = readTemplate(file.name, file.text);
      if (typeof read === 'string') toast(read, { error: true });
      else setSheet({ sheet: 'template', template: read });
    } catch (e) {
      toast(`The file could not be read (${message(e)}). Nothing was added.`, { error: true });
    }
  };
  const exportBackup = async () => {
    if (novelId === null) return;
    try {
      await shareTextFile(BackupService.fileNameFor(title), lib.backups.exportBackup(novelId));
    } catch (e) {
      toast(`The backup could not be saved (${message(e)}).`, { error: true });
    }
  };
  const importBackup = async () => {
    try {
      const file = await pickTextFile();
      if (file === null) return;
      setSheet({ sheet: 'backup', preview: lib.backups.previewImport(file.text) });
    } catch (e) {
      toast(`${message(e)} Your library is unchanged.`, { error: true });
    }
  };

  return (
    <PlanPage title="Import & export" subtitle={open ? title : undefined} back="Back to Settings">
      {open === null ? (
        <Text style={styles.body}>Open a novel from the Library to export it or import a manuscript into it. Backups work without one.</Text>
      ) : (
        <>
          <Section
            icon="export-variant"
            title="Export the manuscript"
            about="Word, PDF, Markdown, plain text or a web page. Choose exactly what goes in: the clean manuscript for readers, or a complete bible with planning, notes and lore; the whole book or one part."
          >
            <GoldButton label="Export manuscript…" icon="export-variant" onPress={() => setSheet({ sheet: 'export' })} />
          </Section>
          <Section
            icon="file-import-outline"
            title="Import a manuscript"
            about={`From a .txt, .md, .docx or .rtf file. Chapters and scenes are found from headings and scene breaks, and you see the result before anything is added. Nothing already in “${title}” is changed.`}
          >
            <OutlineButton label="Choose a file…" icon="file-document-outline" onPress={() => void importManuscript()} />
          </Section>
          <Section
            icon="table-large"
            title="Export records"
            about="Characters, places, factions, events, plot threads, relationships and more, as JSON (every field, with its id) or as tables for a spreadsheet. Private notes and secrets are left out unless you tick them in. Any Visualize view can also be exported on its own, from its Export button."
          >
            <OutlineButton label="Export records…" icon="table-arrow-right" onPress={() => setSheet({ sheet: 'records' })} />
          </Section>
        </>
      )}
      <Section
        icon="puzzle-outline"
        title="Template files"
        about="Share a template with another writer, or bring in one you were given: categories & fields, a profile layout or a progression system. A template holds definitions only, never your novel’s entries or text; a received one is checked and shown to you before it is added, and is never run as code."
      >
        <OutlineButton label="Share a template…" icon="share-variant-outline" onPress={shareTemplate} />
        <OutlineButton label="Import a template file…" icon="file-import-outline" onPress={() => void importTemplate()} />
      </Section>
      <Section
        icon="content-save-outline"
        title="Full backup"
        about="A backup is the whole novel in one file: every chapter, version, record, link, custom field, history, alternate history and saved view, in the same .novel.json format the original Novel Builder writes. It is the only export that can bring a novel back. Importing one shows what it holds, and what it would change, before anything is written."
      >
        {open !== null && <OutlineButton label={`Export backup of “${title}”`} icon="content-save-outline" onPress={() => void exportBackup()} />}
        <OutlineButton label="Import a backup…" icon="backup-restore" onPress={() => void importBackup()} />
      </Section>
      <Muted>Everything here is made on this device. Nothing is uploaded: each file goes only to the place you choose in the share sheet.</Muted>

      {sheet?.sheet === 'export' && novelId !== null && <ExportManuscriptSheet exchange={exchange} novelId={novelId} title={title} onClose={close} />}
      {sheet?.sheet === 'import' && novelId !== null && (
        <ImportManuscriptSheet
          exchange={exchange}
          novelId={novelId}
          fileName={sheet.name}
          blocks={sheet.blocks}
          onClose={close}
          onDone={(created) => {
            const name = sheet.name;
            close();
            if (created.length > 0) lib.settings.write(lastNodeSetting(novelId), created[0]!);
            toast(`Imported “${name}”: ${created.length} ${created.length === 1 ? 'item' : 'items'} added.`, {
              action: created.length > 0 ? { label: 'Open', run: () => router.navigate('/write') } : undefined,
            });
          }}
        />
      )}
      {sheet?.sheet === 'records' && open !== null && <DataExportSheet snapshot={open.snapshot} model={open.model} view={null} onClose={close} />}
      {sheet?.sheet === 'share' && (
        <ShareTemplateSheet
          lib={lib}
          sources={sheet.sources}
          onClose={close}
          onShare={(made, remember) => {
            close();
            const name = templateFileName(made.name);
            void shareBytesFile(name, new TextEncoder().encode(made.toFileText()), 'application/json').then(
              () => {
                remember();
                toast(`Shared “${name}”: version ${made.version} of “${made.name}”. Nothing else was included.`);
              },
              (e: unknown) => toast(`The template could not be shared (${message(e)}).`, { error: true }),
            );
          }}
        />
      )}
      {sheet?.sheet === 'template' && (
        <ImportTemplateSheet
          lib={lib}
          novelId={novelId}
          template={sheet.template}
          onClose={close}
          onDone={(said) => {
            close();
            toast(said);
          }}
        />
      )}
      {sheet?.sheet === 'backup' && (
        <ImportSheet
          preview={sheet.preview}
          onClose={close}
          onAsCopy={() => {
            const p = sheet.preview;
            close();
            attempt(() => toast(`Imported “${lib.library.importAsCopy(p).title}”`), 'It could not be imported');
          }}
          onOpenReview={() => {
            const p = sheet.preview;
            close();
            const mark = ReviewMark.of(p.snapshot.project);
            try {
              const id = openReviewCopy(lib, p.snapshot);
              lib.settings.write(openNovelSettingKey, id);
              router.navigate('/write');
              toast(`Opened the review copy of “${mark?.title ?? p.title}”. It is in Write.`);
            } catch (e) {
              toast(
                e instanceof SnapshotError
                  ? `This review copy cannot be opened: ${e.reason}.`
                  : `The review copy could not be opened, and nothing was changed (${message(e)}).`,
                { error: true },
              );
            }
          }}
          onReplace={() => {
            const p = sheet.preview;
            close();
            attempt(() => {
              const point = lib.backups.importBackup(p);
              toast(point ? `Replaced “${p.title}”. Your version is kept as a restore point.` : `Imported “${p.title}”`, {
                action: point ? { label: 'Undo', run: () => attempt(() => lib.backups.restore(point), 'Undo failed') } : undefined,
              });
            }, 'It could not be imported');
          }}
        />
      )}
    </PlanPage>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});
