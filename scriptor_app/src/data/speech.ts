// A voice that reads text aloud: the device's own text-to-speech (FEATURES.md #13). A port of the Speaker in
// flutter_app/lib/shared/data/speech.dart, over expo-speech. Nothing leaves the device.

import * as Speech from 'expo-speech';

export interface Speaker {
  /** Whether there is a voice to read with here. */
  available(): Promise<boolean>;
  /** Says `text` at `rate` (1 the voice's own pace) and `pitch` (1 its own), and resolves once it has been said, or as
   * soon as stop() is called. False when it could not be said. */
  say(text: string, options?: { rate?: number; pitch?: number }): Promise<boolean>;
  /** Silence, at once. */
  stop(): Promise<void>;
}

export class DeviceSpeaker implements Speaker {
  async available(): Promise<boolean> {
    try {
      return (await Speech.getAvailableVoicesAsync()).length > 0;
    } catch {
      return false;
    }
  }

  say(text: string, options: { rate?: number; pitch?: number } = {}): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        Speech.speak(text, {
          rate: options.rate ?? 1,
          pitch: options.pitch ?? 1,
          onDone: () => resolve(true),
          onStopped: () => resolve(true),
          onError: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  async stop(): Promise<void> {
    try {
      await Speech.stop();
    } catch {
      // Nothing to stop.
    }
  }
}
