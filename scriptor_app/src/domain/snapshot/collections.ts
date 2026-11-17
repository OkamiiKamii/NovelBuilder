// The collections of a novel, as named in `.novel.json` files (format version 4). A port of
// flutter_app/lib/shared/domain/snapshot/collections.dart, in the same order (files are written in this order).
//
// Every collection is kept through import and export, including ones Scriptor has no screens for yet and ones it will
// never use (the original web app's assistant data). A collection not listed here at all, from a newer app, is kept too.

export type CollectionRole = 'core' | 'later' | 'retired';

export const novelCollections: ReadonlyArray<readonly [string, CollectionRole]> = [
  ['chapters', 'core'],
  ['characters', 'later'],
  ['loreEntries', 'core'],
  ['outlines', 'later'],
  ['writingSessions', 'later'],
  ['goals', 'later'],
  ['chapterPlans', 'core'],
  ['chapterBranches', 'later'],
  ['chapterContents', 'later'],
  ['chapterRevisions', 'later'],
  ['loreSchemas', 'core'],
  ['loreLinks', 'core'],
  ['characterRelations', 'core'],
  ['relationSettings', 'later'],
  ['savedViews', 'core'],
  ['storyCalendars', 'core'],
  ['timelineEvents', 'core'],
  ['alternateHistories', 'later'],
  ['plotThreads', 'core'],
  ['structureMarkers', 'later'],
  ['canonFacts', 'core'],
  ['continuityRules', 'later'],
  ['continuityResolutions', 'core'],
  ['systems', 'core'],
  ['systemSheets', 'core'],
  ['progressSnapshots', 'later'],
  ['progressCategories', 'core'],
  ['progressChanges', 'core'],
  ['placeSettings', 'later'],
  ['worldMaps', 'later'],
  ['mapPins', 'later'],
  ['travelSettings', 'later'],
  ['journeys', 'core'],
  ['projectModules', 'later'],
  ['moduleRecords', 'later'],
  ['brainstorms', 'retired'],
  ['ideas', 'retired'],
  ['characterProfiles', 'later'],
  ['characterSecrets', 'later'],
  ['characterNotes', 'later'],
  ['characterHistory', 'later'],
  ['characterTemplates', 'later'],
  ['bookMatter', 'later'],
  ['members', 'core'],
  ['comments', 'core'],
  ['suggestions', 'core'],
  ['activity', 'core'],
];

export const knownCollectionNames: ReadonlySet<string> = new Set(novelCollections.map(([name]) => name));
