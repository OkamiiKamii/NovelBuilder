// The daily nudge on the phone (domain/goals/reminder.ts decides when): local notifications only, planned on this
// phone, nothing sent anywhere. A nudge names the book last worked in and quotes its last line; pressed, it opens Write
// on that chapter at its last word.

import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import type { Library } from '../data/library';
import { readReminder, reminderDates, reminderSetting, type ReminderTime } from '../domain/goals/reminder';
import { pickUpPlace } from './library/PickUp';

const channelId = 'writing';

/** Reminders show in the tray only; while Scriptor is open the writer is already here. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
});

async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(channelId, {
    name: 'Writing reminders',
    description: 'One nudge a day, at the time you chose, never on a day you have already written.',
    importance: AndroidImportance.DEFAULT,
  });
}

/** Asks Android for leave to show notifications (once; Android remembers the answer). Whether it was given. */
export async function allowReminders(): Promise<boolean> {
  await ensureChannel();
  const now = await Notifications.getPermissionsAsync();
  if (now.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Plans the next week of nudges from what is stored now (or clears them with no time chosen). Never throws. */
export async function planReminders(lib: Library): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const time: ReminderTime | null = readReminder(lib.settings.read(reminderSetting));
    if (time === null || !(await Notifications.getPermissionsAsync()).granted) return;
    await ensureChannel();
    const place = pickUpPlace(lib, lib.library.novels());
    const writtenToday = place?.week.some((d) => d.today && d.written) ?? false;
    const title = place ? `Your next page: ${place.novel.title || 'Untitled novel'}` : 'Your next page is waiting';
    const body = place?.lines ? place.lines : 'The first line is yours.';
    for (const date of reminderDates(Date.now(), time, writtenToday)) {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, data: { url: '/write?at=end' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId },
      });
    }
  } catch {
    // A nudge that could not be planned is only a nudge missed; the writing is untouched.
  }
}

/** Opens what a pressed nudge points at: on start (the press that opened the app) and while running. */
export function followReminders(open: (url: string) => void): () => void {
  const follow = (r: Notifications.NotificationResponse | null) => {
    const url = r?.notification.request.content.data?.url;
    if (typeof url === 'string') {
      open(url);
      Notifications.clearLastNotificationResponse();
    }
  };
  follow(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(follow);
  return () => sub.remove();
}
