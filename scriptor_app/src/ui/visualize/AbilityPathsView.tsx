// Visualize › Ability paths (FEATURES.md #288): abilities, skills, classes, techniques and the like, from every system
// and every kind of record set to show here, with the paths the author records between them, drawn as a tree from
// what comes first; seen through a character as held, can be gained or locked, at the end or as of any chapter; paths
// added and removed; what does not add up listed, never fixed. A port of
// flutter_app/lib/features/abilities/ability_paths_page.dart; the tree is src/domain/abilities/paths.ts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { G, Path, Polygon, Text as SvgText } from 'react-native-svg';

import {
  type AbilityNode,
  type AbilityTree,
  type PathEdge,
  type PathRole,
  type Standing,
  abilityTree,
  heldBy,
  pathProblems,
  pathRoleLabel,
  pathTypes,
  standingLabel,
  standings,
  standingsInOrder,
  treeLayout,
} from '../../domain/abilities/paths';
import { localeCompare } from '../../domain/collation';
import { EntityRef } from '../../domain/model/entityRef';
import type { StoryModel } from '../../domain/model/storyModel';
import { readingOrder } from '../../domain/model/storyOrder';
import { stableSorted } from '../../domain/reader/stableSort';
import { isDocument } from '../../domain/records/storyNode';
import { snapshotsOf } from '../../domain/systems/systemsService';
import { dartTrim } from '../../domain/text/dartString';
import {
  abilityBox as box,
  abilityListItem,
  abilityView,
  abilityWords as words,
  acquiredWords,
  edgeShape,
  pathKindChoices,
  pathStyle,
  pathWords,
  standingLine,
} from '../../domain/visualize/story/screens';
import { Chip, GoldButton, Icon, type IconName, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { rememberOrganizeTab } from '../organize/OrganizeScreen';
import { ChooserField } from '../organize/parts';
import { type OpenCast, useCast } from '../organize/useCast';
import { colors, fonts, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { VizFrame, useVizFilters, useVizSelection } from './VizFrame';

const colorOf = (role: PathRole) => pathStyle[role].color ?? colors.text;

export function AbilityPathsView() {
  const open = useCast();
  const [list, setList] = useState(false);
  return (
    <VizFrame
      view="abilities"
      title={words.title}
      subtitle={open?.cast.novelTitle}
      actions={
        <>
          <Chip label={words.tree} icon="family-tree" selected={!list} onPress={() => setList(false)} />
          <Chip label={words.list} icon="format-list-bulleted" selected={list} onPress={() => setList(true)} />
        </>
      }
    >
      <PathsBody list={list} />
    </VizFrame>
  );
}

function PathsBody({ list }: { list: boolean }) {
  const open = useCast();
  const router = useRouter();
  const filters = useVizFilters();
  const { selected, select } = useVizSelection();
  const [hiddenSources, setHiddenSources] = useState<ReadonlySet<string>>(new Set());
  const [hiddenRoles, setHiddenRoles] = useState<ReadonlySet<string>>(new Set());
  const [focusAsked, setFocus] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [atAsked, setAt] = useState<string | null>(null);
  if (open === null) return null;
  const model = open.cast.model;
  const snapshots = snapshotsOf(open.cast.snapshot);
  const tree = abilityTree(model, snapshots);
  if (tree.nodes.length === 0) {
    return (
      <Panel style={styles.gapSm}>
        <Text style={styles.cellTitle}>{words.empty.title}</Text>
        <Muted>{words.empty.message}</Muted>
        <OutlineButton
          label={words.empty.action}
          compact
          onPress={() => {
            rememberOrganizeTab('systems');
            router.navigate('/organize');
          }}
          style={styles.start}
        />
      </Panel>
    );
  }
  const problems = pathProblems(tree, model);
  const view = abilityView(tree, problems, { hiddenSources, hiddenRoles, focus: focusAsked, all, text: filters.query });
  const { nodes, edges, name } = view;
  const through = filters.involving !== null && model.entries.get(filters.involving)?.category === 'character' ? filters.involving : null;
  const documents = readingOrder(model.nodes.values()).filter((n) => isDocument(n.kind));
  const at = atAsked !== null && documents.some((n) => n.id === atAsked) ? atAsked : null;
  const heldSet = through === null ? new Set<string>() : heldBy(model, snapshots, through, at);
  const standing = through === null ? null : standings(tree, heldSet);
  const when = at === null ? 'at the end of the story' : `as of ${model.nodes.get(at)!.displayTitle}`;
  const selectedKey = selected === null ? null : selected.key;
  const selectedNode = selectedKey === null ? undefined : view.byKey.get(selectedKey);
  const toggle = (set: ReadonlySet<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.delete(key);
    else next.add(key);
    return next;
  };
  const restore = () => {
    setHiddenSources(new Set());
    setHiddenRoles(new Set());
    setFocus(null);
  };

  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        {view.focus !== null && <OutlineButton label={words.showAll} compact onPress={() => setFocus(null)} />}
        {view.focus === null && view.lone > 0 && edges.length > 0 && <Chip label={words.alsoDraw(view.lone)} selected={all} onPress={() => setAll(!all)} />}
      </View>
      {through !== null && standing !== null && (
        <View style={styles.gapSm}>
          <ChooserField
            label={words.asOf(model.entries.get(through)!.name)}
            value={at ?? ''}
            choices={[{ value: '', label: words.endOfStory }, ...documents.map((d) => ({ value: d.id, label: d.displayTitle }))]}
            onChoose={(v) => setAt(v.length === 0 ? null : v)}
          />
          <View style={styles.row}>
            {standingsInOrder.map((st) => (
              <View key={st} style={styles.legendItem}>
                <NodeMark standing={st} color={null} size={22} />
                <Text style={styles.small}>{`${standingLabel[st]} (${[...standing.values()].filter((x) => x === st).length})`}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {view.sources.size > 1 && (
        <View style={styles.row} accessibilityLabel="Sources">
          {[...view.sources].map(([key, value]) => (
            <Chip key={key} label={value} selected={!hiddenSources.has(key)} onPress={() => setHiddenSources(toggle(hiddenSources, key, hiddenSources.has(key)))} />
          ))}
        </View>
      )}
      {view.roles.length > 0 && (
        <View style={styles.row} accessibilityLabel="Kinds of path">
          {view.roles.map((r) => (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityState={{ selected: !hiddenRoles.has(r) }}
              onPress={() => setHiddenRoles(toggle(hiddenRoles, r, hiddenRoles.has(r)))}
              style={[styles.roleChip, !hiddenRoles.has(r) && styles.roleChipOn]}
            >
              <Swatch role={r} />
              <Text style={styles.small}>{pathRoleLabel[r]}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {view.left.length > 0 && <Muted>{view.left.join(' ')}</Muted>}

      {nodes.length === 0 ? (
        <Panel style={styles.gapSm}>
          <Text style={styles.cellTitle}>{words.nothingShown.title}</Text>
          <Muted>{words.nothingShown.message}</Muted>
          <OutlineButton label={words.nothingShown.action} compact onPress={restore} style={styles.start} />
        </Panel>
      ) : list ? (
        <PathList nodes={nodes} edges={edges} name={name} selectedKey={selectedKey} held={heldSet} standing={standing} flagged={view.flagged} onPick={(n) => select(n.ref)} />
      ) : (
        <>
          <TreeDrawing
            nodes={nodes}
            edges={edges}
            selectedKey={selectedKey}
            standing={standing}
            held={heldSet}
            flagged={view.flagged}
            onPick={(n) => select(n.ref)}
            onFocus={(n) => setFocus(n.key)}
          />
          <View style={styles.row}>
            {view.roles
              .filter((r) => !hiddenRoles.has(r))
              .map((r) => (
                <View key={r} style={styles.legendItem}>
                  <Swatch role={r} />
                  <Text style={styles.small}>{pathRoleLabel[r]}</Text>
                </View>
              ))}
          </View>
        </>
      )}
      {selectedNode !== undefined && (
        <Details
          open={open}
          model={model}
          tree={tree}
          node={selectedNode}
          name={name}
          standing={standing?.get(selectedNode.key)}
          standingText={
            through === null || standing === null
              ? null
              : standingLine(tree, selectedNode.key, standing.get(selectedNode.key)!, model.entries.get(through)!.name, when, heldSet, name)
          }
        />
      )}
      <Problems problems={problems} tree={tree} name={name} onFocus={setFocus} />
    </View>
  );
}

/** A kind of path, by its colour and its line. */
function Swatch({ role }: { role: PathRole }) {
  const s = pathStyle[role];
  return (
    <Svg width={26} height={12}>
      <Path d="M2 6 L24 6" stroke={colorOf(role)} strokeWidth={s.width} strokeDasharray={s.dash.length > 0 ? s.dash.join(' ') : undefined} strokeLinecap="round" />
    </Svg>
  );
}

/** An ability's mark: a circle, filled and glowing when held, plain when it can be gained, greyed with a lock when
 * locked; seen through no one, ringed in its source's colour. */
function NodeMark({ standing, color, size = box.circle, selected = false }: { standing: Standing | undefined | null; color: string | null; size?: number; selected?: boolean }) {
  const look: { fill: string; ring: string; ringWidth: number; icon: IconName; ink: string; glow: boolean } =
    standing === 'held'
      ? { fill: colors.gold, ring: colors.gold, ringWidth: 2, icon: 'star-four-points', ink: colors.onGold, glow: true }
      : standing === 'available'
        ? { fill: colors.surface, ring: colors.muted, ringWidth: 2, icon: 'star-four-points-outline', ink: colors.muted, glow: false }
        : standing === 'locked'
          ? { fill: colors.elevated, ring: colors.border, ringWidth: 1.5, icon: 'lock-outline', ink: colors.muted, glow: false }
          : { fill: colors.elevated, ring: color ?? colors.gold, ringWidth: 2, icon: 'star-four-points-outline', ink: colors.text, glow: false };
  const mark = (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: look.fill, borderWidth: look.ringWidth, borderColor: look.ring, alignItems: 'center', justifyContent: 'center' },
        look.glow && { shadowColor: colors.gold, shadowOpacity: 0.55, shadowRadius: size * 0.35, elevation: 6 },
      ]}
    >
      <Icon name={look.icon} size={size * 0.5} color={look.ink} />
    </View>
  );
  if (!selected) return mark;
  return <View style={styles.selectedRing}>{mark}</View>;
}

/** The tree, drawn from what comes first at the top: paths as curves by kind, abilities as marks with their names. It
 * scrolls both ways; the buttons zoom; a long press shows only an ability's paths. */
function TreeDrawing({
  nodes,
  edges,
  selectedKey,
  standing,
  held,
  flagged,
  onPick,
  onFocus,
}: {
  nodes: readonly AbilityNode[];
  edges: readonly PathEdge[];
  selectedKey: string | null;
  standing: ReadonlyMap<string, Standing> | null;
  held: ReadonlySet<string>;
  flagged: ReadonlyMap<string, string>;
  onPick: (n: AbilityNode) => void;
  onFocus: (n: AbilityNode) => void;
}) {
  const { width: screen } = useWindowDimensions();
  const compact = sizeClassOf(screen) === 'compact';
  const layout = treeLayout(
    nodes.map((n) => n.key),
    edges,
  );
  const h = box.height;
  const origin = { x: box.width / 2 + box.pad, y: h / 2 + box.pad };
  const size = { width: layout.width + box.pad * 2 + 80, height: layout.height + box.pad };
  const opening = Math.min(1, Math.max(0.6, (screen - space.md * 2) / size.width));
  const [scale, setScale] = useState<number | null>(null);
  const s = scale ?? opening;
  const at = (key: string) => {
    const p = layout.at.get(key)!;
    return { x: p.x + origin.x, y: p.y + origin.y };
  };
  const zoom = (by: number) => setScale(Math.min(3, Math.max(0.2, s * by)));
  const fit = () => setScale(Math.min(1, Math.max(0.2, Math.min((screen - space.md * 2) / size.width, (compact ? 440 : 560) / size.height))));
  const frameHeight = Math.min(compact ? 440 : 560, Math.max(260, size.height * s + 16));
  return (
    <View style={styles.gapXs}>
      <View style={[styles.treeFrame, { height: frameHeight }]} accessibilityLabel={words.label(nodes.length, edges.length)}>
        <ScrollView nestedScrollEnabled>
          <ScrollView horizontal nestedScrollEnabled>
            <View style={{ width: size.width * s, height: size.height * s }}>
              <Svg width={size.width * s} height={size.height * s} viewBox={`0 0 ${size.width} ${size.height}`} style={StyleSheet.absoluteFill}>
                {edges.map((e) => {
                  const st = pathStyle[e.role];
                  const dim = selectedKey !== null && e.from !== selectedKey && e.to !== selectedKey;
                  const shape = edgeShape(e, layout, at, h);
                  const both = e.role !== 'exclusive' && held.has(e.from) && held.has(e.to);
                  const mid = { x: (at(e.from).x + at(e.to).x) / 2, y: (at(e.from).y + at(e.to).y) / 2 - h / 2 + box.circle / 2 };
                  return (
                    <G key={e.id} opacity={dim ? 0.25 : 1}>
                      {both && <Path d={shape.d} stroke={colors.gold} strokeOpacity={0.45} strokeWidth={st.width + 7} fill="none" strokeLinecap="round" />}
                      <Path d={shape.d} stroke={colorOf(e.role)} strokeWidth={st.width} fill="none" strokeLinecap="round" strokeDasharray={st.dash.length > 0 ? st.dash.join(' ') : undefined} />
                      {shape.arrow !== null && <Polygon points={shape.arrow.map((p) => `${p.x},${p.y}`).join(' ')} fill={colorOf(e.role)} />}
                      {e.role === 'other' && (
                        <SvgText x={mid.x} y={mid.y} fontSize={11} fontFamily={fonts.ui} fill={colors.muted} textAnchor="middle">
                          {e.label}
                        </SvgText>
                      )}
                    </G>
                  );
                })}
              </Svg>
              {nodes.map((n) => {
                const p = at(n.key);
                const flag = flagged.get(n.key);
                const st = standing?.get(n.key);
                return (
                  <Pressable
                    key={n.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: n.key === selectedKey }}
                    accessibilityLabel={`${n.name}, ${n.source}${n.rank !== null ? `, rank ${n.rank}` : ''}${st !== undefined ? `, ${standingLabel[st].toLowerCase()}` : ''}${flag === 'problem' ? ', something does not add up' : ''}`}
                    accessibilityHint="Long press to show only its paths"
                    onPress={() => onPick(n)}
                    onLongPress={() => onFocus(n)}
                    style={[styles.node, { left: (p.x - box.width / 2) * s, top: (p.y - h / 2) * s, width: box.width * s, height: h * s, transform: [] }]}
                  >
                    <View style={{ transform: [{ scale: s }], alignItems: 'center', width: box.width, height: h, marginLeft: (box.width * s - box.width) / 2, marginTop: (h * s - h) / 2 }}>
                      <View>
                        <NodeMark standing={st} color={n.color} selected={n.key === selectedKey} />
                        {flag !== undefined && (
                          <View style={[styles.flag, { backgroundColor: flag === 'problem' ? colors.danger : colors.elevated }]}>
                            <Text style={styles.flagText}>{flag === 'problem' ? '!' : '•'}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.nodeName} numberOfLines={2}>
                        {n.name}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      </View>
      <View style={styles.zoomRow}>
        <Muted>{words.hint}</Muted>
        <IconButton icon="magnify-minus-outline" label={words.zoomOut} onPress={() => zoom(0.8)} />
        <IconButton icon="magnify-plus-outline" label={words.zoomIn} onPress={() => zoom(1.25)} />
        <OutlineButton label={words.fit} icon="fit-to-screen-outline" compact tone="muted" onPress={fit} />
      </View>
    </View>
  );
}

/** Every ability in its source, with its paths in words. */
function PathList({
  nodes,
  edges,
  name,
  selectedKey,
  held,
  standing,
  flagged,
  onPick,
}: {
  nodes: readonly AbilityNode[];
  edges: readonly PathEdge[];
  name: (k: string) => string;
  selectedKey: string | null;
  held: ReadonlySet<string>;
  standing: ReadonlyMap<string, Standing> | null;
  flagged: ReadonlyMap<string, string>;
  onPick: (n: AbilityNode) => void;
}) {
  const groups = [...new Set(nodes.map((n) => n.source))];
  return (
    <View style={styles.gapSm}>
      {groups.map((source) => (
        <View key={source} style={styles.gapXs}>
          <Text style={styles.heading} accessibilityRole="header">
            {source}
          </Text>
          {nodes
            .filter((n) => n.source === source)
            .map((n) => {
              const item = abilityListItem(n, edges, name, standing?.get(n.key), held.has(n.key), flagged.get(n.key));
              return (
                <Pressable key={n.key} accessibilityRole="button" onPress={() => onPick(n)} style={[styles.listItem, n.key === selectedKey && styles.chosen]}>
                  <Text style={styles.cellTitle}>{item.title}</Text>
                  {item.lines.length > 0 && <Muted>{item.lines.join('\n')}</Muted>}
                </Pressable>
              );
            })}
        </View>
      ))}
    </View>
  );
}

/** What does not add up, in words, each with a press to show its paths. */
function Problems({ problems, tree, name, onFocus }: { problems: readonly { key: string; severity: string; message: string; nodes: readonly string[] }[]; tree: AbilityTree; name: (k: string) => string; onFocus: (k: string) => void }) {
  return (
    <View style={styles.gapSm}>
      <Text style={styles.heading} accessibilityRole="header">
        {words.problems}
      </Text>
      {problems.length === 0 && <Text style={styles.body}>{words.nothing}</Text>}
      {problems.map((p) => (
        <View key={p.key} style={styles.problem}>
          <Text style={[styles.badge, p.severity === 'problem' ? styles.badgeProblem : styles.badgeNote]}>{p.severity === 'problem' ? words.problem : words.note}</Text>
          <Text style={[styles.body, styles.flex]}>{p.message}</Text>
          {p.nodes.length > 0 && (
            <Pressable accessibilityRole="button" onPress={() => onFocus(p.nodes[0])}>
              <Text style={styles.link}>{words.showPaths(name(p.nodes[0]))}</Text>
            </Pressable>
          )}
        </View>
      ))}
      {tree.notDrawn.length > 0 && <Muted>{words.notDrawn(tree.notDrawn)}</Muted>}
    </View>
  );
}

/** The selected ability: where it comes from, where it stands, who holds it, every path, and a form to add one. */
function Details({
  open,
  model,
  tree,
  node,
  name,
  standing,
  standingText,
}: {
  open: OpenCast;
  model: StoryModel;
  tree: AbilityTree;
  node: AbilityNode;
  name: (k: string) => string;
  standing: Standing | undefined;
  standingText: string | null;
}) {
  const toast = useToast();
  const [type, setType] = useState('prerequisite-for');
  const [own, setOwn] = useState('');
  const [other, setOther] = useState<string | null>(null);
  const [out, setOut] = useState(true);
  const [forKey, setForKey] = useState(node.key);
  if (forKey !== node.key) {
    setForKey(node.key);
    setOther(null);
  }
  const key = node.key;
  const mine = tree.edges.filter((e) => e.from === key || e.to === key);
  const others = stableSorted(
    tree.nodes.filter((n) => n.key !== key),
    (a, b) => localeCompare(a.name, b.name),
  );
  const add = () => {
    const target = other === null ? null : EntityRef.parse(other);
    if (target === null) return;
    const kind = type === 'own' ? dartTrim(own) : type;
    if (kind.length === 0) {
      toast(words.nameOwn);
      return;
    }
    const [from, to] = out ? [node.ref, target] : [target, node.ref];
    const made = open.now((c) => c.createConnection({ from, to, type: kind }));
    if (made !== undefined) {
      setOther(null);
      toast(words.added);
    }
  };
  void model;
  return (
    <Panel style={styles.gapSm}>
      <View style={styles.detailsHead}>
        <NodeMark standing={standing} color={node.color} size={40} />
        <Text style={[styles.detailsName, styles.flex]}>{node.name}</Text>
      </View>
      <Muted>{`${node.source}${node.rank !== null ? ` · rank ${node.rank}` : ''}`}</Muted>
      {standingText !== null && <Text style={styles.standing}>{standingText}</Text>}
      {node.requires.length > 0 && <Text style={styles.body}>{`Requirement rule: “${node.requires}”`}</Text>}
      {node.limits.length > 0 && <Text style={styles.body}>{`Limits: ${node.limits.join(' · ')}`}</Text>}
      <Text style={styles.body}>{node.holders.length === 0 ? words.nobody : words.heldBy(node)}</Text>
      {node.acquired.map((a, i) => (
        <Muted key={i}>{acquiredWords(a)}</Muted>
      ))}
      <Text style={styles.label}>{words.every}</Text>
      {mine.length === 0 && <Muted>{words.noPaths}</Muted>}
      {mine.map((e) => {
        const said = pathWords(e, e.from === key, name);
        return (
          <View key={e.id} style={styles.pathRow}>
            <Text style={[styles.body, styles.flex]}>{`${said}${e.linkId === null ? words.fromBlueprint : ''}`}</Text>
            {e.linkId !== null && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove the path: ${said}`}
                onPress={() => {
                  const done = open.now((c) => {
                    c.removeConnection(e.linkId!);
                    return true;
                  });
                  if (done === true) toast(words.removed);
                }}
              >
                <Text style={styles.link}>{words.remove}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Text style={styles.label}>{words.addPath}</Text>
      <ChooserField
        label={words.whichWay}
        value={out ? 'out' : 'in'}
        choices={[
          { value: 'out', label: words.fromTo(node.name) },
          { value: 'in', label: words.toFrom(node.name) },
        ]}
        onChoose={(v) => setOut(v === 'out')}
      />
      <ChooserField label={words.kind} value={type} choices={pathKindChoices(new Set(pathTypes.keys()))} onChoose={setType} />
      {type === 'own' && (
        <View style={styles.gapXs}>
          <Text style={styles.label}>{words.ownLabel.toUpperCase()}</Text>
          <TextInput value={own} onChangeText={setOwn} placeholder={words.ownHint} placeholderTextColor={colors.muted} selectionColor={colors.gold} style={styles.input} accessibilityLabel={words.ownLabel} />
        </View>
      )}
      <ChooserField
        label={words.other}
        value={other ?? ''}
        choices={[{ value: '', label: '—' }, ...others.map((n) => ({ value: n.key, label: `${n.name} (${n.source})` }))]}
        onChoose={(v) => setOther(v.length === 0 ? null : v)}
      />
      <GoldButton label={words.add} icon="vector-polyline-plus" disabled={other === null} onPress={add} style={styles.start} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  start: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  heading: { fontFamily: fonts.display, fontSize: 17, color: colors.text, marginTop: space.sm },
  cellTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, flexShrink: 1 },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: colors.muted, marginTop: space.xs },
  link: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline', paddingVertical: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, opacity: 0.55 },
  roleChipOn: { opacity: 1, borderColor: colors.gold },
  treeFrame: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  node: { position: 'absolute', overflow: 'visible' },
  nodeName: { marginTop: 4, fontFamily: fonts.book, fontSize: 14, color: colors.text, textAlign: 'center' },
  selectedRing: { padding: 3, borderRadius: 999, borderWidth: 2.5, borderColor: colors.gold },
  flag: { position: 'absolute', right: -4, top: -4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  flagText: { fontSize: 12, fontWeight: '700', color: colors.text },
  zoomRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: space.xs },
  listItem: { padding: space.sm, borderRadius: 8, gap: 2 },
  chosen: { backgroundColor: 'rgba(56, 189, 248, 0.14)' },
  problem: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  badge: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  badgeProblem: { backgroundColor: 'rgba(248, 113, 113, 0.18)', color: colors.danger },
  badgeNote: { backgroundColor: colors.elevated, color: colors.muted },
  detailsHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  detailsName: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  standing: { fontFamily: fonts.book, fontSize: 16, lineHeight: 24, color: colors.text },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, paddingHorizontal: space.md, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
});
