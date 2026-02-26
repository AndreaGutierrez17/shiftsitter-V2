import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

type Body = {
  action?: 'rewind';
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
    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 });
    }
    if (targetUserId === callerUid) {
      return NextResponse.json({ error: 'Invalid targetUserId' }, { status: 400 });
    }

    const db = adminDb();
    const swipeDocId = `${callerUid}_${targetUserId}`;

    if (body.action === 'rewind') {
      await Promise.all([
        db.collection('swipes').doc(swipeDocId).delete().catch(() => undefined),
        db.collection('likes').doc(swipeDocId).delete().catch(() => undefined),
        db.collection('rejects').doc(swipeDocId).delete().catch(() => undefined),
      ]);
      return NextResponse.json({ ok: true, rewound: true });
    }

    if (!direction) {
      return NextResponse.json({ error: 'Missing direction' }, { status: 400 });
    }

    await db.collection('swipes').doc(swipeDocId).set({
      swiperId: callerUid,
      swipedId: targetUserId,
      direction,
      timestamp: FieldValue.serverTimestamp(),
    }, { merge: true });

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

    const matchRef = db.collection('matches').doc(matchId);
    const existingMatch = await matchRef.get();
    if (!existingMatch.exists) {
      await matchRef.set({
        users: [userA, userB],
        userIds: [userA, userB],
        uid1: userA,
        uid2: userB,
        createdAt: FieldValue.serverTimestamp(),
        status: 'confirmed',
      });
    }

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
      const convRef = db.collection('conversations').doc(matchId);
      const convSnap = await convRef.get();
      if (!convSnap.exists) {
        await convRef.set({
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
      }
      conversationId = convRef.id;
    }

    const targetName = body.targetProfile?.name || 'a new family';
    const callerName = body.currentUserProfile?.name || 'a new match';

    const callerNotifId = `new_match_${matchId}_${callerUid}`;
    const targetNotifId = `new_match_${matchId}_${targetUserId}`;

    await Promise.all([
      db.collection('notifications').doc(callerNotifId).set({
        userId: callerUid,
        type: 'new_match',
        matchId,
        fromUserId: targetUserId,
        title: 'New Match!',
        body: `You matched with ${targetName}`,
        href: conversationId ? `/families/messages/${conversationId}` : '/families/messages',
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        readAt: null,
      }, { merge: true }),
      db.collection('notifications').doc(targetNotifId).set({
        userId: targetUserId,
        type: 'new_match',
        matchId,
        fromUserId: callerUid,
        title: 'New Match!',
        body: `You matched with ${callerName}`,
        href: conversationId ? `/families/messages/${conversationId}` : '/families/messages',
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        readAt: null,
      }, { merge: true }),
    ]);

    return NextResponse.json({ ok: true, mutual: true, matchId, conversationId });
  } catch (error) {
    console.error('match-events API error:', error);
    return NextResponse.json({ error: 'Could not process match event.' }, { status: 500 });
  }
}
