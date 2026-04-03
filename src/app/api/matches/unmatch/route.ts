import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

type Body = {
  conversationId?: string;
  otherUserId?: string;
};

async function getUidFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token);
  return decoded.uid;
}

async function deleteConversationMessages(conversationId: string) {
  const db = adminDb();
  const messagesRef = db.collection('conversations').doc(conversationId).collection('messages');
  const snapshot = await messagesRef.get();

  if (snapshot.empty) return;

  let batch = db.batch();
  let pending = 0;

  for (const row of snapshot.docs) {
    batch.delete(row.ref);
    pending += 1;

    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }
}

export async function POST(request: Request) {
  try {
    const callerUid = await getUidFromRequest(request);
    if (!callerUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const otherUserId = body.otherUserId?.trim();
    const conversationId = body.conversationId?.trim();

    if (!otherUserId || otherUserId === callerUid) {
      return NextResponse.json({ error: 'Invalid otherUserId' }, { status: 400 });
    }

    const db = adminDb();
    const [userA, userB] = [callerUid, otherUserId].sort();
    const matchId = `${userA}_${userB}`;

    if (conversationId) {
      const conversationRef = db.collection('conversations').doc(conversationId);
      const conversationSnap = await conversationRef.get();

      if (conversationSnap.exists) {
        const data = conversationSnap.data() as { userIds?: string[] } | undefined;
        const members = Array.isArray(data?.userIds) ? data.userIds : [];
        if (!members.includes(callerUid) || !members.includes(otherUserId)) {
          return NextResponse.json({ error: 'Conversation access denied' }, { status: 403 });
        }

        await deleteConversationMessages(conversationId);
        await conversationRef.delete();
      }
    }

    await Promise.all([
      db.collection('matches').doc(matchId).delete().catch(() => undefined),
      db.collection('likes').doc(`${callerUid}_${otherUserId}`).delete().catch(() => undefined),
      db.collection('likes').doc(`${otherUserId}_${callerUid}`).delete().catch(() => undefined),
      db.collection('swipes').doc(`${callerUid}_${otherUserId}`).set({
        swiperId: callerUid,
        swipedId: otherUserId,
        direction: 'left',
        timestamp: FieldValue.serverTimestamp(),
      }, { merge: true }),
      db.collection('swipes').doc(`${otherUserId}_${callerUid}`).set({
        swiperId: otherUserId,
        swipedId: callerUid,
        direction: 'left',
        timestamp: FieldValue.serverTimestamp(),
      }, { merge: true }),
      db.collection('rejects').doc(`${callerUid}_${otherUserId}`).set({
        from: callerUid,
        to: otherUserId,
        createdAt: FieldValue.serverTimestamp(),
        reason: 'unmatched',
      }, { merge: true }),
      db.collection('rejects').doc(`${otherUserId}_${callerUid}`).set({
        from: otherUserId,
        to: callerUid,
        createdAt: FieldValue.serverTimestamp(),
        reason: 'unmatched',
      }, { merge: true }),
    ]);

    return NextResponse.json({ ok: true, matchId });
  } catch (error) {
    console.error('unmatch API error:', error);
    return NextResponse.json({ error: 'Could not end this match.' }, { status: 500 });
  }
}
