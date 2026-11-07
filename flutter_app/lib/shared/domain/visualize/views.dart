import 'package:flutter/foundation.dart';

/// A view of the Visualize workspace, as the original names it. [phase] is the roadmap phase that builds its page in
/// this app; views with no page yet are listed as coming, never offered as empty pages.
@immutable
class VisualView {
  const VisualView(this.key, this.label, this.description, {required this.phase});

  /// Kept as the original writes it, so saved views and the novel's `viewsOff` setting read the same.
  final String key;
  final String label;
  final String description;
  final int phase;

  String get path => key == 'relationships' ? '/visualize' : '/visualize/$key';
}

/// Every view, in the order the original's Visualize page offers them.
const visualViews = [
  VisualView(
    'timeline',
    'Timeline',
    'Events in the order they happen in the story, apart from the order the reader meets them.',
    phase: 10,
  ),
  VisualView(
    'order',
    'Story vs reading order',
    'When things happen beside when the reader meets them: flashbacks, flash-forwards, foreshadowing and things revealed afterwards. Nothing here moves a chapter.',
    phase: 10,
  ),
  VisualView('relationships', 'Relationship map', 'Who is tied to whom, and how each tie stands.', phase: 9),
  VisualView(
    'plot',
    'Plot board',
    'Each plot thread: where it develops across the chapters, as you record it.',
    phase: 12,
  ),
  VisualView(
    'structure',
    'Structure and pacing',
    'How long each chapter and scene is, the acts they sit in, and your structural markers.',
    phase: 12,
  ),
  VisualView(
    'graph',
    'Knowledge graph',
    'Every record and every connection between them, read from the records; nothing is stored for the graph.',
    phase: 13,
  ),
  VisualView('places', 'Places', 'Locations, what lies inside what, and what happened where.', phase: 11),
  VisualView(
    'progression',
    'Character progression',
    'How characters’ abilities and states change over the story.',
    phase: 11,
  ),
  VisualView(
    'history',
    'Character history',
    'One character’s life, gathered from every record: events with their age, where they were, what they belonged to, the chapters they appear in, how their relationships change and how they progress.',
    phase: 10,
  ),
  VisualView(
    'appearances',
    'Character appearances',
    'Characters against chapters and scenes, from your appearance records.',
    phase: 12,
  ),
  VisualView('knowledge', 'Secrets and knowledge', 'Who knows each secret, and how that spreads.', phase: 17),
  VisualView('kinds', 'Records by kind', 'Any kind of record, your own kinds included.', phase: 14),
  VisualView('abilities', 'Ability paths', 'Abilities, skills and classes, and the paths between them.', phase: 15),
  VisualView('journeys', 'Journeys', 'Who travels from where to where, and when, as far as you say.', phase: 16),
  VisualView('factions', 'Factions', 'Who belongs to each faction, its allies and enemies, over the story.', phase: 16),
  VisualView('ownership', 'Ownership', 'Who has held each item, in order.', phase: 16),
  VisualView('charts', 'Charts', 'Counts and distributions of what you record.', phase: 18),
];

/// The phase this build has reached: views of later phases are listed as coming.
const builtThroughPhase = 18;

bool isBuilt(VisualView v) => v.phase <= builtThroughPhase;

VisualView? viewOf(String key) => visualViews.where((v) => v.key == key).firstOrNull;
String viewLabel(String key) => viewOf(key)?.label ?? key;
