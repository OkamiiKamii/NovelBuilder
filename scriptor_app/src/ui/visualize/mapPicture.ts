// A map's background picture, chosen from the writer's own device: read as a data URL kept in the novel (never sent
// anywhere), at most 4096 pixels on its longer side, with its size so the map can take its shape. A port of
// flutter_app/lib/features/places/data/map_image.dart.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { mapImageLimit } from '../../domain/places/places';

/** The longest side a map picture is kept at, as in the Flutter app. */
const mapMaxEdge = 4096;

export class ImageTooLarge extends Error {
  constructor() {
    super(`That image is too large for a map background (more than ${Math.trunc(mapImageLimit / 1024 / 1024)} MB).`);
  }
}

/** Asks for a picture; null when the writer cancels. */
export async function pickMapPicture(): Promise<{ url: string; width: number; height: number } | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  if (width >= height && width > mapMaxEdge) context.resize({ width: mapMaxEdge, height: null });
  else if (height > width && height > mapMaxEdge) context.resize({ width: null, height: mapMaxEdge });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  if (!saved.base64) throw new Error('The picture could not be read.');
  const url = `data:image/jpeg;base64,${saved.base64}`;
  if (url.length > mapImageLimit * 1.37) throw new ImageTooLarge();
  return { url, width: saved.width, height: saved.height };
}
