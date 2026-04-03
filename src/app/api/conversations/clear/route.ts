import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

type Body = {
  conversationId?: string;
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
    const conversationId = body.conversationId?.trim();

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
    }

    const db = adminDb();
    const conversationRef = db.collection('conversations').doc(conversationId);
    const conversationSnap = await conversationRef.get();

    if (!conversationSnap.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const data = conversationSnap.data() as { userIds?: string[] } | undefined;
    const members = Array.isArray(data?.userIds) ? data.userIds : [];
    if (!members.includes(callerUid)) {
      return NextResponse.json({ error: 'Conversation access denied' }, { status: 403 });
    }

    await deleteConversationMessages(conversationId);

    await Promise.all([
      conversationRef.set(
        {
          lastMessage: '',
          lastMessageAt: FieldValue.serverTimestamp(),
          lastMessageSenderId: '',
          unreadCount: {},
        },
        { merge: true }
      ),
      db
        .collection('notifications')
        .doc(callerUid)
        .collection('items')
        .where('type', '==', 'message')
        .where('data.conversationId', '==', conversationId)
        .get()
        .then(async (snapshot) => {
          if (snapshot.empty) return;
          let batch = db.batch();
          let pending = 0;

          for (const row of snapshot.docs) {
            batch.update(row.ref, {
              read: true,
              readAt: FieldValue.serverTimestamp(),
            });
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
        }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('clear conversation API error:', error);
    return NextResponse.json({ error: 'Could not clear this chat.' }, { status: 500 });
  }
}
