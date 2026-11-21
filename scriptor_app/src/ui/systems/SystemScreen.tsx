// A SYSTEM'S PAGE (FEATURES.md #230–#238), at /organize/systems?system=<id>&tab=<tab>&sheet=<id>: a chip for each of
// the novel's systems, and its two halves, "In the story" (its live window: the climb, the face-off, the system's
// messages and the readings of the pages come with it) and "The blueprint": a new system from blank or a preset, the
// head (name, what it is, delete), the live window beside the tabs on a wide screen (folded above them on a phone), and
// the tabs: attributes & resources, levels & realms (numbered levels with a cap, points and an XP curve; or named
// stages with what each requires and gives), classes, skills & more (ranks, groups, items with everything they do),
// tables, and the sheets. Every formula is checked as it is typed. The pure parts are
// src/domain/systems/screens/systemsPage.ts; a port of flutter_app/lib/features/progression/systems_page.dart.

import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { PageScroll } from '../pageScroll';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { characterPath } from '../../domain/characters/screens/create';
import { worldEntryPath } from '../../domain/codex/screens/entryPage';
import type { JsonMap } from '../../domain/json';
import { abilityId } from '../../domain/model/entityRef';
import { StoryModel } from '../../domain/model/storyModel';
import { entryForAbility, loggable } from '../../domain/systems/skillTies';
import { maps } from '../../domain/records/jsonRecord';
import type { SysItem, SysTrack, SystemBlueprint } from '../../domain/records/system';
import { checkFormula } from '../../domain/systems/compute';
import type { SystemChanges } from '../../domain/systems/systemChanges';
import { moved, patched, rowTools, without } from '../../domain/systems/screens/parts';
import {
  type SystemsMode,
  type SystemsTab,
  addCost,
  addGroup,
  addModifier,
  addSheet,
  addStage,
  addTable,
  addToGroup,
  addTrack,
  addVariable,
  blueprintBesideFrom,
  cellEdit,
  deleteSystemDialog,
  describeSystem,
  editCost,
  editList,
  editModifier,
  editTable,
  groupBox,
  itemEdit,
  itemEditor,
  itemWords,
  kitsWords,
  laterKey,
  moveIn,
  moveStage,
  namedList,
  newNamed,
  openingMode,
  removeCost,
  removeFrom,
  removeModifier,
  rankPowerEdit,
  rankPowerNote,
  rankRows,
  removeStage,
  removeSystem,
  removingDialog,
  renameSystem,
  setGrants,
  sheetsTab,
  stageEdit,
  stageGrants,
  stageRow,
  systemsModeKey,
  systemsModeLabel,
  systemsModes,
  systemsOf,
  systemsTabs,
  systemChipLabel,
  systemsWords,
  tabChip,
  tabOf,
  tableGrid,
  tableWords,
  trackBox,
  trackEdit,
  trackWords,
  variableEdit,
  variableKindLabel,
  variableRow,
} from '../../domain/systems/screens/systemsPage';
import { ActionSheet, ConfirmDelete, Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, type IconName, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { rememberOrganizeTab } from '../organize/OrganizeScreen';
import { ChooserField, SavedText } from '../organize/parts';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { AddSystemSheet } from './SystemGallery';
import { SystemSwitch } from './SystemSwitch';
import { SheetEditor } from './SheetTools';
import { LiveWindow } from './StatusWindow';
import { ClimbView, FaceOffView, SystemSpeaks } from './SheetTools';
import { LevelsView, NumberLedgerView, PagesNamesView } from './PageReadings';
import { type OpenSystems, useSystems } from './useSystems';

type Change = (c: SystemChanges) => void;
type Ask = { title: string; message: string; confirm: string; run: () => void } | null;

export function SystemScreen({ systemId, tab, sheetId }: { systemId: string | null; tab: string | null; sheetId: string | null }) {
  const sys = useSystems();
  const lib = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [chosen, setChosen] = useState<string | null>(systemId);
  const [mode, setModeState] = useState<SystemsMode>(() => openingMode({ tab, sheetId }, lib.settings.read(systemsModeKey)));
  const [current, setTab] = useState<SystemsTab>(tabOf(tab));
  const [sheet, setSheet] = useState<string | null>(sheetId);
  const [choosing, setChoosing] = useState(false);
  const [folded, setFolded] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  useEffect(() => setChosen(systemId), [systemId]);
  const model = useMemo(() => (sys ? StoryModel.fromSnapshot(sys.snapshot) : null), [sys]);

  const back = () => {
    rememberOrganizeTab('systems');
    router.navigate('/organize');
  };
  if (!sys || !model) {
    return (
      <Page top={insets.top} title="No novel open" onBack={() => router.navigate('/')}>
        <Muted>Systems work inside one novel. Open one from your Library.</Muted>
      </Page>
    );
  }
  const { systems, system } = systemsOf(model, chosen);
  const setMode = (m: SystemsMode) => {
    setModeState(m);
    lib.saves.saveNow(`setting:${systemsModeKey}`, () => {
      lib.settings.write(systemsModeKey, m);
      lib.novels.touchSettings();
    });
  };
  /** A system added from the gallery: shown (the book's own, in the story; a new one, its blueprint). */
  const made = (id: string, own: boolean) => {
    setChosen(id);
    if (own) setMode('story');
    else {
      setModeState('blueprint');
      setTab('variables');
    }
  };
  if (!system) {
    return (
      <Page top={insets.top} title={systemsWords.title} onBack={back}>
        <Muted>This novel has no system yet. Begin one from Organize › Systems.</Muted>
        <OutlineButton label="Organize › Systems" icon="arrow-left" compact onPress={back} style={styles.start} />
      </Page>
    );
  }

  const beside = width - space.md * 2 >= blueprintBesideFrom;
  const blueprint = (
    <View style={styles.gap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {systemsTabs.map((t) => (
          <Chip key={t} label={tabChip(system, model, t)} selected={current === t} onPress={() => setTab(t)} />
        ))}
      </ScrollView>
      {current === 'variables' ? (
        <VariablesTab sys={sys} system={system} />
      ) : current === 'tracks' ? (
        <TracksTab sys={sys} system={system} />
      ) : current === 'kits' ? (
        <KitsTab sys={sys} system={system} model={model} onAsk={setAsk} />
      ) : current === 'tables' ? (
        <TablesTab sys={sys} system={system} />
      ) : (
        <SheetsTab sys={sys} system={system} model={model} chosen={sheet} onChoose={setSheet} />
      )}
    </View>
  );

  return (
    <Page top={insets.top} title={systemsWords.title} subtitle={String(sys.snapshot.project['title'] ?? '')} onBack={back}>
      <View style={styles.wrap}>
        {systems.map((s) => (
          <View key={s.id} style={s.off && !(s.id === system.id) && styles.dim}>
            <Chip label={systemChipLabel(s)} selected={s.id === system.id} onPress={() => setChosen(s.id)} />
          </View>
        ))}
      </View>
      {system.off && (
        <View style={styles.banner} accessibilityRole="alert">
          <Text style={styles.bannerTitle}>{systemsWords.turnedOff}</Text>
          <Muted>{systemsWords.turnedOffNote}</Muted>
          <SystemSwitch sys={sys} system={system} />
        </View>
      )}
      <View style={styles.halves} accessibilityRole="tablist">
        {systemsModes.map((m) => {
          const on = m === mode;
          return (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setMode(m)}
              style={[styles.half, on && styles.halfOn]}
            >
              <Icon name={m === 'story' ? 'book-open-page-variant-outline' : 'floor-plan'} size={18} color={on ? colors.onGold : colors.gold} />
              <Text style={[styles.halfText, on && { color: colors.onGold }]}>{systemsModeLabel[m]}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'story' ? (
        <View style={styles.gap}>
          {/* As the Flutter page's "In the story": the window; the climb; the face-off; the system speaks; then what the
              chapters say (the numbers, what they give a level to, the names the system lacks). */}
          <LiveWindow key={`window-${system.id}`} sys={sys} systemId={system.id} />
          <ClimbView key={`climb-${system.id}`} sys={sys} systemId={system.id} sheetId={null} />
          <FaceOffView key={`faceoff-${system.id}`} sys={sys} systemId={system.id} />
          <OutlineButton label="The system speaks" icon="bullhorn-outline" compact onPress={() => setSpeaking(true)} style={styles.speaks} />
          <NumberLedgerView key={`ledger-${system.id}`} sys={sys} systemId={system.id} />
          <LevelsView sys={sys} />
          <PagesNamesView key={`names-${system.id}`} sys={sys} systemId={system.id} />
          {speaking && (
            <Sheet visible onClose={() => setSpeaking(false)} title="The system speaks" wide>
              <SystemSpeaks sys={sys} systemId={system.id} sheetId={null} onWrite={() => setSpeaking(false)} />
            </Sheet>
          )}
        </View>
      ) : (
        <View style={styles.gap}>
          <View style={styles.row}>
            <GoldButton label={systemsWords.addSystem} icon="plus" compact onPress={() => setChoosing(true)} />
          </View>
          <BlueprintHead
            sys={sys}
            system={system}
            onDelete={() => {
              const d = deleteSystemDialog(system);
              setAsk({
                title: d.title,
                message: d.message,
                confirm: d.confirm,
                run: () => {
                  if (sys.now(removeSystem(system.id)) !== undefined) {
                    setChosen(null);
                    toast(d.done);
                  }
                },
              });
            }}
          />
          {beside ? (
            <View style={styles.beside}>
              <View style={styles.flex}>{blueprint}</View>
              <View style={{ width: 400 }}>
                <LiveWindow key={`blueprint-window-${system.id}`} sys={sys} systemId={system.id} />
              </View>
            </View>
          ) : (
            <>
              <Panel style={styles.fold} glow={false}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !folded }}
                  onPress={() => setFolded(!folded)}
                  style={styles.foldHead}
                >
                  <Icon name="application-outline" size={22} />
                  <View style={styles.flex}>
                    <Text style={styles.foldTitle}>{systemsWords.windowFolded}</Text>
                    <Muted>{systemsWords.windowFoldedCaption}</Muted>
                  </View>
                  <Icon name={folded ? 'chevron-down' : 'chevron-up'} size={22} color={colors.muted} />
                </Pressable>
                {!folded && <LiveWindow key={`blueprint-window-${system.id}`} sys={sys} systemId={system.id} />}
              </Panel>
              {blueprint}
            </>
          )}
        </View>
      )}

      {choosing && <AddSystemSheet sys={sys} model={model} onClose={() => setChoosing(false)} onMade={made} />}
      {ask && (
        <ConfirmDelete
          visible
          title={ask.title}
          message={ask.message}
          confirmLabel={ask.confirm}
          onClose={() => setAsk(null)}
          onConfirm={() => {
            ask.run();
            setAsk(null);
          }}
        />
      )}
    </Page>
  );
}

function Page({ top, title, subtitle, onBack, children }: { top: number; title: string; subtitle?: string; onBack: () => void; children: ReactNode }) {
  return (
    <View style={[styles.page, { paddingTop: top }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Back" onPress={onBack} />
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <PageScroll contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </PageScroll>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- shared parts

/** Saves a typed change through autosave (nothing when the change is refused before it is made, a blank name). */
const typed = (sys: OpenSystems, key: string, change: Change | null) => {
  if (change) sys.later(key, change);
};

/** A formula or condition field, checked as it is typed: what it comes to now, or what is wrong with it. */
function FormulaField({
  sys,
  system,
  label,
  hint,
  value,
  condition,
  saveKey,
  onSave,
}: {
  sys: OpenSystems;
  system: SystemBlueprint;
  label: string;
  hint: string;
  value: string;
  condition: boolean;
  saveKey: string;
  onSave: (text: string) => Change | null;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  const check = useMemo(() => checkFormula(system, text, { condition }), [system, text, condition]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          typed(sys, saveKey, onSave(v));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={hint}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        style={[styles.input, styles.mono]}
      />
      {check.error ? (
        <Text style={styles.error}>{check.error}</Text>
      ) : check.preview ? (
        <Text style={styles.preview}>{check.preview}</Text>
      ) : null}
    </View>
  );
}

/** A row's up, down and remove buttons. */
function RowTools({ name, first, last, onMove, onRemove }: { name: string; first: boolean; last: boolean; onMove: (by: number) => void; onRemove: () => void }) {
  const t = rowTools(name, first, last);
  return (
    <View style={styles.tools}>
      <Step icon="arrow-up" label={t.up} disabled={!t.canUp} onPress={() => onMove(-1)} />
      <Step icon="arrow-down" label={t.down} disabled={!t.canDown} onPress={() => onMove(1)} />
      <IconButton icon="delete-outline" label={t.remove} onPress={onRemove} color={colors.danger} />
    </View>
  );
}

function Step({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && { backgroundColor: colors.elevated }]}
    >
      <Icon name={icon} size={20} color={disabled ? colors.border : colors.text} />
    </Pressable>
  );
}

function Add({ label, onPress, icon = 'plus' }: { label: string; onPress: () => void; icon?: IconName }) {
  return <OutlineButton label={label} icon={icon} compact onPress={onPress} />;
}

// ---------------------------------------------------------------------------------------------------- the head

function BlueprintHead({ sys, system, onDelete }: { sys: OpenSystems; system: SystemBlueprint; onDelete: () => void }) {
  return (
    <Panel style={styles.gapSm}>
      <SavedText label={systemsWords.name} value={system.name} onSave={(v) => typed(sys, laterKey(system.id, 'name'), renameSystem(system.id, v))} />
      <SavedText
        label={systemsWords.description}
        value={system.description}
        multiline
        onSave={(v) => typed(sys, laterKey(system.id, 'description'), describeSystem(system.id, v))}
      />
      {!system.off && <SystemSwitch sys={sys} system={system} />}
      <OutlineButton label={systemsWords.delete} icon="delete-outline" compact tone="danger" onPress={onDelete} style={styles.start} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------- variables

function VariablesTab({ sys, system }: { sys: OpenSystems; system: SystemBlueprint }) {
  const kinds = Object.keys(variableKindLabel);
  return (
    <View style={styles.gap}>
      {system.variables.map((_, i) => {
        const row = variableRow(system, i);
        const save = (field: Parameters<typeof variableEdit>[2]) => (v: string) => typed(sys, laterKey(system.id, 'var', row.id, field), variableEdit(system.id, row.id, field, v));
        return (
          <Panel key={row.id} style={styles.gapSm} glow={false}>
            <View style={styles.rowTop}>
              <View style={styles.flex}>
                <SavedText label={itemWords.name} value={row.name} hint={row.key} onSave={save('name')} />
              </View>
              <RowTools
                name={row.name}
                first={row.first}
                last={row.last}
                onMove={(by) => sys.now(moveIn(system.id, 'variables', row.id, by))}
                onRemove={() => sys.now(removeFrom(system.id, 'variables', row.id))}
              />
            </View>
            <ChooserField
              label={`Kind of ${row.name}`}
              value={row.kind}
              choices={kinds.map((k) => ({ value: k, label: variableKindLabel[k] }))}
              onChoose={(k) => {
                const change = variableEdit(system.id, row.id, 'kind', k);
                if (change) sys.now(change);
              }}
            />
            {row.base !== null && <SavedText label="Starting value" value={row.base} keyboardType="numeric" onSave={save('base')} />}
            {row.formula && (
              <FormulaField
                sys={sys}
                system={system}
                label={row.formula.label}
                hint={row.formula.hint}
                value={row.formula.value}
                condition={false}
                saveKey={laterKey(system.id, 'var', row.id, 'formula')}
                onSave={(v) => variableEdit(system.id, row.id, 'formula', v)}
              />
            )}
            {row.options && <SavedText label={row.options.label} value={row.options.value} placeholder={row.options.hint} onSave={save('options')} />}
            {row.unit && <SavedText label={row.unit.label} value={row.unit.value} placeholder={row.unit.hint} onSave={save('unit')} />}
          </Panel>
        );
      })}
      <View style={styles.row}>
        {kinds.map((k) => (
          <Add key={k} label={variableKindLabel[k]} onPress={() => sys.now(addVariable(system.id, k))} />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- tracks

function TracksTab({ sys, system }: { sys: OpenSystems; system: SystemBlueprint }) {
  return (
    <View style={styles.gap}>
      {system.tracks.map((track, i) => (
        <TrackBox key={track.id} sys={sys} system={system} track={track} first={i === 0} last={i === system.tracks.length - 1} />
      ))}
      <View style={styles.row}>
        <Add label={trackWords.levels} onPress={() => sys.now(addTrack(system.id, 'levels'))} />
        <Add label={trackWords.stages} onPress={() => sys.now(addTrack(system.id, 'stages'))} />
      </View>
    </View>
  );
}

function TrackBox({ sys, system, track, first, last }: { sys: OpenSystems; system: SystemBlueprint; track: SysTrack; first: boolean; last: boolean }) {
  const box = trackBox(system, track);
  const save = (field: Parameters<typeof trackEdit>[2]) => (v: string) => typed(sys, laterKey(system.id, 'track', track.id, field), trackEdit(system.id, track.id, field, v));
  return (
    <Panel style={styles.gapSm} glow={false}>
      <View style={styles.rowTop}>
        <Text style={styles.boxTitle}>{box.title}</Text>
        <RowTools
          name={track.name}
          first={first}
          last={last}
          onMove={(by) => sys.now(moveIn(system.id, 'tracks', track.id, by))}
          onRemove={() => sys.now(removeFrom(system.id, 'tracks', track.id))}
        />
      </View>
      <SavedText label={trackWords.name} value={track.name} hint={box.key} onSave={save('name')} />
      {box.cap !== null && <SavedText label={trackWords.cap} value={box.cap} placeholder={trackWords.capHint} keyboardType="number-pad" onSave={save('cap')} />}
      {box.points !== null && <SavedText label={trackWords.points} value={box.points} keyboardType="decimal-pad" onSave={save('points')} />}
      {box.curve && (
        <FormulaField
          sys={sys}
          system={system}
          label={box.curve.label}
          hint={box.curve.hint}
          value={box.curve.value}
          condition={false}
          saveKey={laterKey(system.id, 'track', track.id, 'curve')}
          onSave={(v) => trackEdit(system.id, track.id, 'curve', v)}
        />
      )}
      {box.unit !== null && <SavedText label={trackWords.unit} value={box.unit} placeholder={trackWords.unitHint} onSave={save('unit')} />}
      {box.sources && <SavedText label={box.sources.label} value={box.sources.value} placeholder={trackWords.sourcesHint} onSave={save('sources')} />}
      {box.costs && <Muted>{box.costs}</Muted>}
      {track.kind === 'stages' && (
        <View style={styles.gapSm}>
          {track.stages.map((stage, i) => (
            <StageBox key={stage.id} sys={sys} system={system} track={track} index={i} />
          ))}
          <Add label={trackWords.addStage} onPress={() => sys.now(addStage(system.id, track.id))} />
        </View>
      )}
    </Panel>
  );
}

function StageBox({ sys, system, track, index }: { sys: OpenSystems; system: SystemBlueprint; track: SysTrack; index: number }) {
  const stage = track.stages[index];
  const row = stageRow(track, index);
  const grants = stageGrants(system, stage);
  const [giving, setGiving] = useState(false);
  const key = (field: string) => laterKey(system.id, 'stage', stage.id, field);
  return (
    <View style={styles.stage}>
      <View style={styles.rowTop}>
        <Text style={styles.stageLabel}>{row.label}</Text>
        <RowTools
          name={stage.name}
          first={row.first}
          last={row.last}
          onMove={(by) => sys.now(moveStage(system.id, track.id, stage.id, by))}
          onRemove={() => sys.now(removeStage(system.id, track.id, stage.id))}
        />
      </View>
      <SavedText label={itemWords.name} value={stage.name} onSave={(v) => typed(sys, key('name'), stageEdit(system.id, track.id, stage.id, 'name', v))} />
      {row.requires && (
        <FormulaField
          sys={sys}
          system={system}
          label={row.requires.label}
          hint={row.requires.hint}
          value={row.requires.value}
          condition
          saveKey={key('requires')}
          onSave={(v) => stageEdit(system.id, track.id, stage.id, 'requires', v)}
        />
      )}
      <SavedText
        label={row.note.label}
        value={row.note.value}
        placeholder={row.note.hint}
        multiline
        onSave={(v) => typed(sys, key('note'), stageEdit(system.id, track.id, stage.id, 'note', v))}
      />
      <Text style={styles.label}>{grants.label.toUpperCase()}</Text>
      <View style={styles.wrap}>
        {grants.none && <Muted>{grants.none}</Muted>}
        {grants.given.map((g) => (
          <Pressable
            key={g.id}
            accessibilityRole="button"
            accessibilityLabel={g.removeTooltip}
            onPress={() => sys.now(setGrants(system.id, track.id, stage.id, stage.grants.filter((id) => id !== g.id)))}
            style={styles.grant}
          >
            <Text style={styles.grantText}>{g.name}</Text>
            <Icon name="close" size={16} color={colors.muted} />
          </Pressable>
        ))}
        {grants.giveTooltip && <IconButton icon="plus" label={grants.giveTooltip} onPress={() => setGiving(true)} color={colors.gold} bordered />}
      </View>
      {grants.makeFirst && <Muted>{grants.makeFirst}</Muted>}
      <ActionSheet
        visible={giving}
        title={grants.giveTooltip ?? ''}
        onClose={() => setGiving(false)}
        actions={grants.offered.flatMap((g) =>
          g.items.map((i) => ({
            label: `${i.name} · ${g.group}`,
            icon: 'star-four-points-outline' as IconName,
            onPress: () => sys.now(setGrants(system.id, track.id, stage.id, [...stage.grants, i.id])),
          })),
        )}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- classes, skills…

function NamedRows({
  sys,
  system,
  noun,
  hint,
  names,
  saveKey,
  edit,
}: {
  sys: OpenSystems;
  system: SystemBlueprint;
  noun: string;
  hint: string;
  names: readonly { id: string; name: string }[];
  saveKey: string;
  /** How the list as stored changes. */
  edit: (change: (all: JsonMap[]) => JsonMap[]) => Change;
}) {
  const [badPower, setBadPower] = useState<Record<string, string | null>>({});
  const ranked = noun === 'rank' ? rankRows(system) : null;
  const list = ranked ?? namedList(noun, names, hint);
  return (
    <View style={styles.gapSm}>
      {list.rows.map((r) => (
        <View key={r.id} style={styles.rowTop}>
          <View style={styles.flex}>
            <SavedText
              label={r.label}
              value={r.value}
              onSave={(v) => {
                if (v.trim().length > 0) sys.later(laterKey(system.id, saveKey, r.id), edit((all) => patched(all, r.id, { name: v.trim() })));
              }}
            />
            {ranked && (
              <View style={styles.powerField}>
                <SavedText
                  label={ranked.rows.find((p) => p.id === r.id)!.power.label}
                  value={ranked.rows.find((p) => p.id === r.id)!.power.value}
                  placeholder={ranked.rows.find((p) => p.id === r.id)!.power.hint}
                  keyboardType="numeric"
                  hint={badPower[r.id] ?? undefined}
                  onSave={(v) => {
                    setBadPower((b) => ({ ...b, [r.id]: rankPowerNote(v) }));
                    typed(sys, laterKey(system.id, 'rankPower', r.id), rankPowerEdit(system.id, r.id, v));
                  }}
                />
              </View>
            )}
          </View>
          <RowTools
            name={r.value}
            first={r.first}
            last={r.last}
            onMove={(by) => sys.now(edit((all) => moved(all, r.id, by)))}
            onRemove={() => sys.now(edit((all) => without(all, r.id)))}
          />
        </View>
      ))}
      <Add label={list.add} onPress={() => sys.now(edit((all) => [...all, newNamed(noun)]))} />
    </View>
  );
}

function KitsTab({ sys, system, model, onAsk }: { sys: OpenSystems; system: SystemBlueprint; model: StoryModel; onAsk: (a: Ask) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const remove = (ids: string[], what: string, change: Change) => {
    const asked = removingDialog(model, system, new Set(ids), what);
    if (asked === null) sys.now(change);
    else onAsk({ title: asked.title, message: asked.message, confirm: asked.confirm, run: () => sys.now(change) });
  };
  return (
    <View style={styles.gap}>
      <Panel style={styles.gapSm} glow={false}>
        <Text style={styles.boxTitle}>{kitsWords.ranks}</Text>
        <Muted>{kitsWords.ranksNote}</Muted>
        <NamedRows
          sys={sys}
          system={system}
          noun="rank"
          hint={kitsWords.ranksHint}
          names={system.ranks}
          saveKey="rank"
          edit={(change) => editList(system.id, 'ranks', change)}
        />
      </Panel>
      {system.groupList.map((g) => {
        const box = groupBox(system, g.id);
        return (
          <Panel key={g.id} style={styles.gapSm} glow={false}>
            <SavedText
              label={kitsWords.groupName}
              value={box.name}
              onSave={(v) => {
                if (v.trim().length > 0) sys.later(laterKey(system.id, 'group', g.id), editList(system.id, 'groups', (all) => patched(all, g.id, { name: v.trim() })));
              }}
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>{kitsWords.single}</Text>
              <Switch
                value={box.single}
                onValueChange={(v) => sys.now(editList(system.id, 'groups', (all) => patched(all, g.id, { single: v })))}
                trackColor={{ true: colors.gold, false: colors.border }}
                thumbColor={colors.text}
                accessibilityLabel={`${box.name}: ${kitsWords.single}`}
              />
            </View>
            {box.items.map((item) => {
              const it = system.items.find((x) => x.id === item.id)!;
              const expanded = open === item.id;
              return (
                <View key={item.id} style={styles.item}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => setOpen(expanded ? null : item.id)}
                    style={styles.itemHead}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.subtitle.length > 0 && <Muted>{item.subtitle}</Muted>}
                    </View>
                    <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
                  </Pressable>
                  {expanded && (
                    <ItemEditor
                      sys={sys}
                      system={system}
                      model={model}
                      item={it}
                      onRemove={() => remove([it.id], it.name, removeFrom(system.id, 'items', it.id))}
                    />
                  )}
                </View>
              );
            })}
            <View style={styles.row}>
              <Add label={box.add} onPress={() => sys.now(addToGroup(system.id, { id: g.id, name: box.name }))} />
              <OutlineButton
                label={box.removeLabel}
                icon="delete-outline"
                compact
                tone="danger"
                accessibilityLabel={box.removeSemantics}
                onPress={() =>
                  remove(box.itemIds, box.removeWhat, (c) => {
                    removeFrom(system.id, 'groups', g.id)(c);
                    editList(system.id, 'items', (all) => all.filter((i) => i['groupId'] !== g.id))(c);
                  })
                }
              />
            </View>
          </Panel>
        );
      })}
      <Add label={kitsWords.addGroup} onPress={() => sys.now(addGroup(system.id))} />
    </View>
  );
}

function ItemEditor({ sys, system, model, item, onRemove }: { sys: OpenSystems; system: SystemBlueprint; model: StoryModel; item: SysItem; onRemove: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const id = abilityId(system.id, item.id);
  const entry = entryForAbility(model, id);
  const ed = itemEditor(system, item);
  const key = (field: string) => laterKey(system.id, 'item', item.id, field);
  const save = (field: Parameters<typeof itemEdit>[2]) => (v: string) => typed(sys, key(field), itemEdit(system.id, item.id, field, v));
  const firstKey = ed.targets[0]?.value ?? '';
  return (
    <View style={styles.gapSm}>
      <SavedText label={itemWords.name} value={item.name} onSave={save('name')} />
      <ChooserField label={ed.rank.label} value={ed.rank.value} choices={ed.rank.options} onChoose={(v) => sys.now(itemEdit(system.id, item.id, 'rankId', v)!)} />
      <ChooserField label={ed.parent.label} value={ed.parent.value} choices={ed.parent.options} onChoose={(v) => sys.now(itemEdit(system.id, item.id, 'parentId', v)!)} />
      <SavedText label={ed.description.label} value={ed.description.value} placeholder={ed.description.hint} multiline onSave={save('description')} />
      <FormulaField
        sys={sys}
        system={system}
        label={ed.requires.label}
        hint={ed.requires.hint}
        value={ed.requires.value}
        condition
        saveKey={key('requires')}
        onSave={(v) => itemEdit(system.id, item.id, 'requires', v)}
      />
      {ed.modifiers.length > 0 && <Text style={styles.itemTitle}>{itemWords.boosts}</Text>}
      {ed.modifiers.map((m) => (
        <View key={m.id} style={styles.sub}>
          <Text style={styles.itemTitle}>{m.summary}</Text>
          <ChooserField
            label={m.targetLabel}
            value={m.target ?? ''}
            choices={[...(m.target === null ? [{ value: '', label: '—' }] : []), ...ed.targets]}
            onChoose={(v) => sys.now(editModifier(system.id, item.id, m.id, { target: v }))}
          />
          <ChooserField label={m.howSemantics} value={m.op} choices={ed.ops} onChoose={(v) => sys.now(editModifier(system.id, item.id, m.id, { op: v }))} />
          <ChooserField
            label={m.amountLabel}
            value={m.amountMode}
            choices={ed.amountChoices}
            onChoose={(v) => sys.now(editModifier(system.id, item.id, m.id, { byRank: v === 'rank' }))}
          />
          {m.byRank ? (
            m.rankNote !== null && <Muted>{m.rankNote}</Muted>
          ) : (
            <SavedText
              label={m.valueLabel}
              value={m.value}
              placeholder={m.valueHint}
              onSave={(v) => sys.later(key(`mod:${m.id}`), editModifier(system.id, item.id, m.id, { value: v }))}
            />
          )}
          {m.preview !== null && <Muted>{m.preview}</Muted>}
          {m.problem !== null && (
            <Text accessibilityRole="alert" style={styles.problem}>
              {m.problem}
            </Text>
          )}
          <OutlineButton label={itemWords.removeChange} icon="close" compact tone="muted" onPress={() => sys.now(removeModifier(system.id, item.id, m.id))} style={styles.start} />
        </View>
      ))}
      {ed.costs.map((c) => (
        <View key={c.id} style={styles.sub}>
          <ChooserField
            label={c.targetLabel}
            value={c.target ?? ''}
            choices={[...(c.target === null ? [{ value: '', label: '—' }] : []), ...ed.targets]}
            onChoose={(v) => sys.now(editCost(system.id, item.id, c.id, { target: v }))}
          />
          <SavedText
            label={c.amountLabel}
            value={c.amount}
            placeholder={c.amountHint}
            onSave={(v) => sys.later(key(`cost:${c.id}`), editCost(system.id, item.id, c.id, { amount: v }))}
          />
          <OutlineButton label={itemWords.removeCost} icon="close" compact tone="muted" onPress={() => sys.now(removeCost(system.id, item.id, c.id))} style={styles.start} />
        </View>
      ))}
      {ed.canAdd && (
        <View style={styles.row}>
          <Add label={itemWords.addChange} onPress={() => sys.now(addModifier(system.id, item.id, firstKey))} />
          <Add label={itemWords.addCost} onPress={() => sys.now(addCost(system.id, item.id, firstKey))} />
        </View>
      )}
      {ed.more.map((m) => (
        <SavedText key={m.key} label={m.label} value={m.value} placeholder={m.hint} onSave={save(m.key)} />
      ))}
      <View style={styles.row}>
        {loggable(system, item) && (
          <OutlineButton
            label={entry ? 'Open in World' : 'Log in World'}
            icon="book-open-variant"
            compact
            accessibilityLabel={`${entry ? 'Open' : 'Log'} ${item.name} in World`}
            onPress={() => {
              if (entry) router.navigate(worldEntryPath(entry.id) as never);
              else if (sys.now((c) => c.logInWorld(id))) toast(`“${item.name}” logged in World.`);
            }}
          />
        )}
        <OutlineButton label={ed.remove} icon="delete-outline" compact tone="danger" accessibilityLabel={ed.removeSemantics} onPress={onRemove} style={styles.start} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- tables

function TablesTab({ sys, system }: { sys: OpenSystems; system: SystemBlueprint }) {
  return (
    <View style={styles.gap}>
      {system.matrices.map((m, i) => {
        const grid = tableGrid(system, m.id);
        const edit = (key: 'rows' | 'columns') => (change: (all: JsonMap[]) => JsonMap[]) => editTable(system.id, m.id, (t) => ({ [key]: change(maps(t[key])) }));
        return (
          <Panel key={m.id} style={styles.gapSm} glow={false}>
            <View style={styles.rowTop}>
              <View style={styles.flex}>
                <SavedText
                  label={tableWords.name}
                  value={m.name}
                  onSave={(v) => {
                    if (v.trim().length > 0) sys.later(laterKey(system.id, 'table', m.id), editTable(system.id, m.id, () => ({ name: v.trim() })));
                  }}
                />
              </View>
              <RowTools
                name={m.name}
                first={i === 0}
                last={i === system.matrices.length - 1}
                onMove={(by) => sys.now(moveIn(system.id, 'matrices', m.id, by))}
                onRemove={() => sys.now(removeFrom(system.id, 'matrices', m.id))}
              />
            </View>
            <Text style={styles.label}>ROWS</Text>
            <NamedRows sys={sys} system={system} noun="row" hint={tableWords.hint} names={m.rows} saveKey={`table:${m.id}:row`} edit={edit('rows')} />
            <Text style={styles.label}>COLUMNS</Text>
            <NamedRows sys={sys} system={system} noun="column" hint={tableWords.hint} names={m.columns} saveKey={`table:${m.id}:column`} edit={edit('columns')} />
            {grid && (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={styles.gridRow}>
                    <View style={{ width: 120 }} />
                    {grid.columns.map((c) => (
                      <Text key={c.id} style={[styles.gridHead, { width: 140 }]} numberOfLines={1}>
                        {c.name}
                      </Text>
                    ))}
                  </View>
                  {grid.rows.map((r) => (
                    <View key={r.id} style={styles.gridRow}>
                      <Text style={[styles.gridHead, { width: 120 }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                      {r.cells.map((cell) => (
                        <View key={cell.columnId} style={{ width: 140, padding: 2 }}>
                          <CellInput
                            label={cell.label}
                            value={cell.value}
                            onType={(v) => sys.later(laterKey(system.id, 'cell', m.id, r.id, cell.columnId), cellEdit(system.id, m.id, r.id, cell.columnId, v))}
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </Panel>
        );
      })}
      <Add label={tableWords.addTable} onPress={() => sys.now(addTable(system.id))} />
    </View>
  );
}

function CellInput({ label, value, onType }: { label: string; value: string; onType: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  return (
    <TextInput
      value={text}
      onChangeText={(v) => {
        setText(v);
        onType(v);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={tableWords.cellHint}
      placeholderTextColor={colors.muted}
      selectionColor={colors.gold}
      accessibilityLabel={label}
      style={styles.cell}
    />
  );
}

// ---------------------------------------------------------------------------------------------------- sheets

function SheetsTab({
  sys,
  system,
  model,
  chosen,
  onChoose,
}: {
  sys: OpenSystems;
  system: SystemBlueprint;
  model: StoryModel;
  chosen: string | null;
  onChoose: (id: string | null) => void;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const tab = sheetsTab(model, system, chosen);
  return (
    <View style={styles.gap}>
      <View style={styles.wrap}>
        {tab.sheets.map((s) => (
          <Chip key={s.id} label={s.label} selected={s.selected} onPress={() => onChoose(s.selected ? null : s.id)} />
        ))}
      </View>
      {tab.empty ? (
        <Muted>{tab.empty}</Muted>
      ) : (
        tab.free.length > 0 && <Add label={tab.addLabel} icon="account-plus-outline" onPress={() => setAdding(true)} />
      )}
      {tab.selected && (
        <View style={styles.gapSm}>
          <View style={styles.rowTop}>
            <Text style={styles.boxTitle}>{tab.selected.name}</Text>
            <OutlineButton
              label={tab.selected.open}
              icon="open-in-new"
              compact
              onPress={() =>
                router.navigate((tab.selected!.character ? characterPath(tab.selected!.sheet.entryId) : worldEntryPath(tab.selected!.sheet.entryId)) as never)
              }
            />
          </View>
          <SheetEditor key={tab.selected.sheet.id} sys={sys} systemId={system.id} sheetId={tab.selected.sheet.id} />
        </View>
      )}
      <ActionSheet
        visible={adding}
        title={tab.addTooltip}
        onClose={() => setAdding(false)}
        actions={tab.free.map((e) => ({
          label: e.name,
          icon: 'account-outline' as IconName,
          onPress: () => {
            const made = sys.now(addSheet(system.id, e.id));
            if (made) onChoose(made.id);
          },
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  speaks: { alignSelf: 'flex-start' },
  dim: { opacity: 0.6 },
  banner: { gap: 2, padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.surface },
  bannerTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  page: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingTop: space.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  subtitle: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  body: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chips: { gap: 8 },
  halves: { flexDirection: 'row', gap: space.sm },
  half: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  halfOn: { backgroundColor: colors.gold },
  halfText: { fontFamily: fonts.ui, fontSize: 14.5, color: colors.gold },
  beside: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  fold: { gap: space.sm, paddingVertical: space.sm },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  foldTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.text },
  boxTitle: { flex: 1, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text, paddingTop: 10 },
  tools: { flexDirection: 'row', alignItems: 'center', paddingTop: 20 },
  step: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 6, marginBottom: space.md },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  input: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  mono: { fontFamily: fonts.numbers, fontSize: 14.5 },
  error: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger },
  preview: { fontFamily: fonts.ui, fontSize: 13, color: colors.success },
  stage: { gap: space.xs, padding: space.sm, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  stageLabel: { flex: 1, fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.muted, paddingTop: 10 },
  grant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  grantText: { fontFamily: fonts.ui, fontSize: 13.5, color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  switchText: { flex: 1, fontFamily: fonts.ui, fontSize: 14.5, color: colors.text },
  item: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: space.sm, gap: space.sm },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  itemTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.text },
  powerField: { width: 160 },
  problem: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.danger },
  sub: { paddingLeft: space.sm, borderLeftWidth: 2, borderLeftColor: colors.border, gap: space.xs },
  gridRow: { flexDirection: 'row', alignItems: 'center' },
  gridHead: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.gold, paddingHorizontal: 4 },
  cell: {
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 14,
  },
});
