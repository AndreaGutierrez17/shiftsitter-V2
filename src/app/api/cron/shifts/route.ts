import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const headerSecret = request.headers.get('x-cron-secret') || '';
  return bearer === secret || headerSecret === secret;
}

function toDate(value: unknown) {
  const ts = value as { toDate?: () => Date } | undefined;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  return null;
}

function buildNotifId(type: string, shiftId: string, uid: string) {
  return `${type}_${shiftId}_${uid}`;
}

function isoOrNull(date: Date | null) {
  return date ? date.toISOString() : null;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = adminDb();
  const now = new Date();
  const nowTs = Timestamp.fromDate(now);
  const in55 = new Date(now.getTime() + 55 * 60 * 1000);
  const in60 = new Date(now.getTime() + 60 * 60 * 1000);
  const in55Ts = Timestamp.fromDate(in55);
  const in60Ts = Timestamp.fromDate(in60);

  const summary = {
    startReminderCandidates: 0,
    startRemindersSent: 0,
    completedCandidates: 0,
    completedMarked: 0,
  };

  try {
    const remindersSnap = await db
      .collection('shifts')
      .where('status', '==', 'accepted')
      .where('startAt', '>=', in55Ts)
      .where('startAt', '<=', in60Ts)
      .get();

    summary.startReminderCandidates = remindersSnap.size;

    for (const doc of remindersSnap.docs) {
      const shift = doc.data() as Record<string, unknown>;
      if (shift.startReminderSent === true) continue;

      const proposerId = String(shift.proposerId || '');
      const accepterId = String(shift.accepterId || '');
      const userIds = [proposerId, accepterId].filter(Boolean);
      if (userIds.length < 2) continue;

      const startAt = toDate(shift.startAt);
      const batch = db.batch();

      batch.set(doc.ref, {
        startReminderSent: true,
        startReminderSentAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      for (const uid of userIds) {
        const otherUserUid = userIds.find((id) => id !== uid) || null;
        const notifRef = db.collection('notifications').doc(buildNotifId('shift_starting_soon', doc.id, uid));
        batch.set(notifRef, {
          userId: uid,
          toUid: uid,
          type: 'shift_starting_soon',
          title: 'Shift starts in 1 hour',
          body: 'Your accepted shift starts in about 1 hour.',
          createdAt: FieldValue.serverTimestamp(),
          read: false,
          readAt: null,
          href: '/families/calendar',
          deepLink: `/families/calendar?shift=${doc.id}`,
          data: {
            shiftId: doc.id,
            startAt: isoOrNull(startAt),
            otherUserUid,
          },
        }, { merge: true });
      }

      await batch.commit();
      summary.startRemindersSent += 1;
    }

    const completedSnap = await db
      .collection('shifts')
      .where('status', '==', 'accepted')
      .where('endAt', '<=', nowTs)
      .get();

    summary.completedCandidates = completedSnap.size;

    for (const doc of completedSnap.docs) {
      const shift = doc.data() as Record<string, unknown>;
      if (shift.completedAt) continue;

      const proposerId = String(shift.proposerId || '');
      const accepterId = String(shift.accepterId || '');
      const userIds = [proposerId, accepterId].filter(Boolean);
      if (userIds.length < 2) continue;

      const endAt = toDate(shift.endAt);
      const batch = db.batch();

      batch.set(doc.ref, {
        status: 'completed',
        completedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      for (const uid of userIds) {
        const otherUserUid = userIds.find((id) => id !== uid) || null;
        const notifRef = db.collection('notifications').doc(buildNotifId('shift_completed_review', doc.id, uid));
        batch.set(notifRef, {
          userId: uid,
          toUid: uid,
          type: 'shift_completed_review',
          title: 'Shift completed',
          body: 'Your shift has ended. You can now leave a review.',
          createdAt: FieldValue.serverTimestamp(),
          read: false,
          readAt: null,
          href: '/families/calendar',
          deepLink: `/families/calendar?shift=${doc.id}&tab=review`,
          data: {
            shiftId: doc.id,
            endAt: isoOrNull(endAt),
            otherUserUid,
          },
        }, { merge: true });
      }

      await batch.commit();
      summary.completedMarked += 1;
    }

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error('cron shifts error:', error);
    return NextResponse.json({ error: 'Cron run failed.' }, { status: 500 });
  }
}

