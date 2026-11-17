// Files the writer picks or saves: backups (`.novel.json`) and cover pictures. Nothing is uploaded: on Android a file is
// saved through the share sheet ("Save to Files", Drive, email: wherever the writer chooses), and picked with the
// system's own file and photo pickers, which need no permission.

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';

/** Offers a text file through the share sheet. Resolves once the sheet closes. */
export async function shareTextFile(fileName: string, text: string, mimeType = 'application/json'): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone cannot share files.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

/** Asks for a file and reads it as text. Null when the writer cancels. */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  return { name: asset.name, text: await new File(asset.uri).text() };
}

/** The longest side a cover is kept at, as in the Flutter app. */
const coverMax = 800;

/** Asks for a picture and returns it as a JPEG data URL at most 800 px wide, stored inside the novel. Null when the
 * writer cancels. */
export async function pickCoverPicture(): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  // The longest side becomes at most 800 px; the other follows, keeping the picture's shape.
  if (width >= height && width > coverMax) context.resize({ width: coverMax, height: null });
  else if (height > width && height > coverMax) context.resize({ width: null, height: coverMax });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  if (!saved.base64) throw new Error('The picture could not be read.');
  return `data:image/jpeg;base64,${saved.base64}`;
}
