import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

type Body = {
  targetUserId?: string;
  direction?: 'left' | 'right';
  currentUserProfile?: { name?: string; photoURLs?: string[] } | null;
  targetProfile?: { name?: string; photoURLs?: string[] } | null;
};

async function getUidFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token);
  return decoded.uid;
}

const sortedPair = (a: string, b: string) => [a, b].sort();

export async function POST(request: Request) {
  try {
    const callerUid = await getUidFromRequest(request);
    if (!callerUid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Body;
    const targetUserId = body.targetUserId?.trim();
    const direction = body.direction;
    if (!targetUserId || !direction) {
      return NextResponse.json({ error: 'Missing targetUserId or direction' }, { status: 400 });
    }
    if (targetUserId === callerUid) {
      return NextResponse.json({ error: 'Invalid targetUserId' }, { status: 400 });
    }

    const db = adminDb();

    if (direction === 'left') {
      await db.collection('rejects').doc(`${callerUid}_${targetUserId}`).set({
        from: callerUid,
        to: targetUserId,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return NextResponse.json({ ok: true, mutual: false });
    }

    await db.collection('likes').doc(`${callerUid}_${targetUserId}`).set({
      from: callerUid,
      to: targetUserId,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const reverseLike = await db.collection('likes').doc(`${targetUserId}_${callerUid}`).get();
    const mutual = reverseLike.exists;
    if (!mutual) {
      return NextResponse.json({ ok: true, mutual: false });
    }

    const [userA, userB] = sortedPair(callerUid, targetUserId);
    const matchId = `${userA}_${userB}`;

    await db.collection('matches').doc(matchId).set({
      users: [userA, userB],
      userIds: [userA, userB],
      uid1: userA,
      uid2: userB,
      createdAt: FieldValue.serverTimestamp(),
      status: 'confirmed',
    }, { merge: true });

    let conversationId: string | null = null;
    const existingConversations = await db
      .collection('conversations')
      .where('userIds', 'array-contains', callerUid)
      .get();

    const existingConversation = existingConversations.docs.find((snap) => {
      const data = snap.data() as { userIds?: string[] } | undefined;
      return Array.isArray(data?.userIds) && data!.userIds.includes(targetUserId);
    });

    if (existingConversation) {
      conversationId = existingConversation.id;
    } else {
      const convRef = await db.collection('conversations').add({
        userIds: [callerUid, targetUserId],
        createdAt: FieldValue.serverTimestamp(),
        lastMessage: '',
        lastMessageAt: FieldValue.serverTimestamp(),
        lastMessageSenderId: '',
        userProfiles: {
          [callerUid]: {
            name: body.currentUserProfile?.name || 'User',
            photoURLs: body.currentUserProfile?.photoURLs || [],
          },
          [targetUserId]: {
            name: body.targetProfile?.name || 'User',
            photoURLs: body.targetProfile?.photoURLs || [],
          },
        },
      });
      conversationId = convRef.id;
    }

    const targetName = body.targetProfile?.name || 'a new family';
    const callerName = body.currentUserProfile?.name || 'a new match';

    await Promise.all([
      db.collection('notifications').add({
        userId: callerUid,
        type: 'new_match',
        title: 'New Match!',
        body: `You matched with ${targetName}`,
        href: conversationId ? `/families/messages/${conversationId}` : '/families/messages',
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      }),
      db.collection('notifications').add({
        userId: targetUserId,
        type: 'new_match',
        title: 'New Match!',
        body: `You matched with ${callerName}`,
        href: conversationId ? `/families/messages/${conversationId}` : '/families/messages',
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      }),
    ]);

    return NextResponse.json({ ok: true, mutual: true, matchId, conversationId });
  } catch (error) {
    console.error('match-events API error:', error);
    return NextResponse.json({ error: 'Could not process match event.' }, { status: 500 });
  }
}
