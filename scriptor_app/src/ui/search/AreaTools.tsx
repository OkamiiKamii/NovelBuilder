// The two buttons at the top of the areas (the Library, Write's contents, Organize, Analytics): Search, or go anywhere
// (the magnifier), and the Tutorial (the question mark, unless switched off in the tutorial). DESIGN.md keeps the
// bottom bar to the five areas, so they sit in each area's title row, where the Flutter app's rail had them.

import { StyleSheet, View } from 'react-native';

import { IconButton } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { colors } from '../theme';
import { tutorialShownKey } from '../tutorial/TutorialSheet';
import { openSearch, openTutorial } from './opener';

export function AreaTools({ search = true }: { search?: boolean }) {
  const lib = useLibrary();
  useLibraryRevision();
  const tutorial = lib.settings.read(tutorialShownKey) !== false;
  return (
    <View style={styles.row}>
      {search && <IconButton icon="magnify" label="Search, or go anywhere" onPress={openSearch} color={colors.gold} />}
      {tutorial && <IconButton icon="help-circle-outline" label="Tutorial" onPress={openTutorial} color={colors.muted} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
