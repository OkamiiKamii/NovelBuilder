import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isAndroidApp } from './platform';

const asBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Hands a file to the person. In a browser and in the desktop app that is
 * an ordinary download. The Android app has no downloads of its own, so the
 * file is written to the app's own space and Android's share sheet is
 * opened on it: from there it can be saved to Files or Drive, or sent.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (isAndroidApp()) {
    void (async () => {
      try {
        const written = await Filesystem.writeFile({ path: filename, data: await asBase64(blob), directory: Directory.Cache });
        await Share.share({ title: filename, files: [written.uri], dialogTitle: `Save or send ${filename}` });
      } catch (err) {
        // Closing the share sheet without choosing is not a failure.
        if (!/cancel/i.test(String((err as Error)?.message ?? err))) window.alert(`The file could not be saved: ${(err as Error)?.message ?? err}`);
      }
    })();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file-system-friendly version of a title, keeping letters and digits from any script. */
export const fileSlug = (title: string): string => title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'untitled';
