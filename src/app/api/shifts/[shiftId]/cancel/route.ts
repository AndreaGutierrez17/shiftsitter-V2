import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

const CANCELLATION_CUTOFF_HOURS = 4;
const REASON_CODES = ['illness', 'emergency', 'schedule_change', 'transportation_issue', 'other'] as const;
type CancelReasonCode = (typeof REASON_CODES)[number];

async function getUidFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token);
  return decoded.uid;
}

function parseShiftStartAt(shift: Record<string, unknown>) {
  const fromTimestamp = shift.startAt as { toDate?: () => Date } | undefined;
  if (typeof fromTimestamp?.toDate === 'function') return fromTimestamp.toDate();

  const date = typeof shift.date === 'string' ? shift.date : '';
  const startTime = typeof shift.startTime === 'string' ? shift.startTime : '';
  if (!date || !startTime) return null;

  const parsed = new Date(`${date}T${startTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reasonLabel(code: CancelReasonCode) {
  switch (code) {
    case 'illness': return 'Illness';
    case 'emergency': return 'Emergency';
    case 'schedule_change': return 'Schedule change';
    case 'transportation_issue': return 'Transportation issue';
    default: return 'Other';
  }
}

export async function POST(request: Request, context: { params: Promise<{ shiftId: string }> }) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { shiftId } = await context.params;
    if (!shiftId) return NextResponse.json({ error: 'Missing shiftId' }, { status: 400 });

    const body = (await request.json()) as { reasonCode?: string; reasonText?: string };
    const reasonCode = body.reasonCode;
    const reasonText = typeof body.reasonText === 'string' ? body.reasonText.trim().slice(0, 140) : '';

    if (!reasonCode || !REASON_CODES.includes(reasonCode as CancelReasonCode)) {
      return NextResponse.json({ error: 'Invalid reasonCode' }, { status: 400 });
    }

    const db = adminDb();
    const shiftRef = db.collection('shifts').doc(shiftId);

    const result = await db.runTransaction(async (tx) => {
      const shiftSnap = await tx.get(shiftRef);
      if (!shiftSnap.exists) throw new Error('Shift not found.');

      const shift = shiftSnap.data() as Record<string, unknown>;
      const proposerId = String(shift.proposerId || '');
      const accepterId = String(shift.accepterId || '');
      const userIds = Array.isArray(shift.userIds) ? (shift.userIds as unknown[]).map(String) : [proposerId, accepterId].filter(Boolean);
      const status = String(shift.status || '');

      if (!userIds.includes(uid)) throw new Error('You are not allowed to cancel this shift.');
      if (!['proposed', 'accepted'].includes(status)) throw new Error('This shift cannot be cancelled.');

      const startAtDate = parseShiftStartAt(shift);
      if (!startAtDate) throw new Error('Shift start time is missing or invalid.');

      const cutoffHours = typeof shift.cancellationWindowHours === 'number'
        ? Number(shift.cancellationWindowHours)
        : CANCELLATION_CUTOFF_HOURS;

      const cutoffMs = cutoffHours * 60 * 60 * 1000;
      if (Date.now() > startAtDate.getTime() - cutoffMs) {
        throw new Error(`You can’t cancel within ${cutoffHours} hours of the start time.`);
      }

      const otherUserUid = userIds.find((id) => id !== uid) || '';
      if (!otherUserUid) throw new Error('Could not resolve the other participant.');

      const cancellerSnap = await tx.get(db.collection('users').doc(uid));
      const cancellerName = String((cancellerSnap.data() as { name?: string } | undefined)?.name || 'A user');

      tx.update(shiftRef, {
        status: 'cancelled',
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledByUid: uid,
        cancelReasonCode: reasonCode,
        cancelReasonText: reasonText || '',
        cancellationWindowHours: cutoffHours,
      });

      const notifId = `shift_cancelled_${shiftId}_${otherUserUid}`;
      tx.set(db.collection('notifications').doc(notifId), {
        userId: otherUserUid,
        toUid: otherUserUid,
        type: 'shift_cancelled',
        title: 'Shift Cancelled',
        body: `${cancellerName} cancelled a shift (${reasonLabel(reasonCode as CancelReasonCode)}).`,
        href: '/families/calendar',
        deepLink: `/families/calendar?shift=${shiftId}`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        readAt: null,
        data: {
          shiftId,
          cancelledByUid: uid,
          reasonCode,
          reasonText: reasonText || null,
          startAt: startAtDate.toISOString(),
        },
      }, { merge: true });

      return {
        ok: true,
        shiftId,
        otherUserUid,
        cutoffHours,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not cancel shift.';
    const status = /Unauthorized/.test(message) ? 401 : /not allowed|cannot be cancelled|within \d+ hours|not found|missing/i.test(message) ? 400 : 500;
    console.error('shift cancel API error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}

