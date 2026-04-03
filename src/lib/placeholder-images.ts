import type { Timestamp } from 'firebase/firestore';

export const USER_ONLINE_WINDOW_MS = 90_000;
export const CONVERSATION_TYPING_WINDOW_MS = 10_000;

type TimestampLike =
  | Timestamp
  | Date
  | { toMillis: () => number }
  | { seconds: number; nanoseconds?: number };

export function getTimestampMillis(value: unknown): number | null {
  if (!value) return null;

  if (value instanceof Date) return value.getTime();

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : null;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { seconds?: unknown }).seconds === 'number'
  ) {
    const seconds = Number((value as { seconds: number }).seconds);
    const nanoseconds = Number((value as { nanoseconds?: number }).nanoseconds || 0);
    return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
  }

  return null;
}

export function isUserOnlineFromLastSeen(lastSeen: unknown, now = Date.now()) {
  const millis = getTimestampMillis(lastSeen);
  if (millis == null) return false;
  return now - millis <= USER_ONLINE_WINDOW_MS;
}

export function isConversationTypingActive(isTyping: unknown, updatedAt: unknown, now = Date.now()) {
  if (isTyping !== true) return false;
  const millis = getTimestampMillis(updatedAt);
  if (millis == null) return false;
  return now - millis <= CONVERSATION_TYPING_WINDOW_MS;
}
