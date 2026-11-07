/// The collections of a novel, as the original app names them in its `.novel.json` files (format version 4).
///
/// Every collection is kept through import and export, including ones this version has no screens for yet (they wait
/// for their phase) and ones it will never use (the original app's assistant, sync and collaboration data, kept so a
/// round trip loses nothing). A collection that is not listed here at all, from a newer app, is kept too.
enum CollectionRole {
  /// Read by the shared model now.
  core,

  /// Kept and exported; a later phase gives it screens.
  later,

  /// The original app's AI assistant, cloud sync and team features. Not part of this app; kept so nothing is lost.
  retired,
}

const novelCollections = <String, CollectionRole>{
  'chapters': CollectionRole.core,
  'characters': CollectionRole.later,
  'loreEntries': CollectionRole.core,
  'outlines': CollectionRole.later,
  'writingSessions': CollectionRole.later,
  'goals': CollectionRole.later,
  'chapterPlans': CollectionRole.core,
  'chapterBranches': CollectionRole.later,
  'chapterContents': CollectionRole.later,
  'chapterRevisions': CollectionRole.later,
  'loreSchemas': CollectionRole.core,
  'loreLinks': CollectionRole.core,
  'characterRelations': CollectionRole.core,
  'relationSettings': CollectionRole.later,
  'savedViews': CollectionRole.core,
  'storyCalendars': CollectionRole.core,
  'timelineEvents': CollectionRole.core,
  'alternateHistories': CollectionRole.later,
  'plotThreads': CollectionRole.core,
  'structureMarkers': CollectionRole.later,
  'canonFacts': CollectionRole.core,
  'continuityRules': CollectionRole.later,
  'continuityResolutions': CollectionRole.core,
  'systems': CollectionRole.core,
  'systemSheets': CollectionRole.core,
  'progressSnapshots': CollectionRole.later,
  'progressCategories': CollectionRole.core,
  'progressChanges': CollectionRole.core,
  'placeSettings': CollectionRole.later,
  'worldMaps': CollectionRole.later,
  'mapPins': CollectionRole.later,
  'travelSettings': CollectionRole.later,
  'journeys': CollectionRole.core,
  'projectModules': CollectionRole.later,
  'moduleRecords': CollectionRole.later,
  'brainstorms': CollectionRole.retired,
  'ideas': CollectionRole.retired,
  'characterProfiles': CollectionRole.later,
  'characterSecrets': CollectionRole.later,
  'characterNotes': CollectionRole.later,
  'characterHistory': CollectionRole.later,
  'characterTemplates': CollectionRole.later,
  'bookMatter': CollectionRole.later,
  'members': CollectionRole.core,
  'comments': CollectionRole.core,
  'suggestions': CollectionRole.core,
  'activity': CollectionRole.core,
};
