import { NextResponse } from 'next/server';
import { adminAuth, adminDb, adminMessaging } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

type NotifyBody = {
  type: 'message' | 'match' | 'shift';
  conversationId?: string;
  targetUserIds?: string[];
  title?: string;
  body?: string;
  link?: string;
};

async function getUidFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token);
  return decoded.uid;
}

export async function POST(request: Request) {
  try {
    const callerUid = await getUidFromRequest(request);
    if (!callerUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as NotifyBody;
    if (!body?.type) {
      return NextResponse.json({ error: 'Missing notification type' }, { status: 400 });
    }

    const db = adminDb();
    let targetUserIds = Array.isArray(body.targetUserIds) ? body.targetUserIds.filter(Boolean) : [];

    if (body.conversationId) {
      const convSnap = await db.collection('conversations').doc(body.conversationId).get();
      if (!convSnap.exists) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
      const conv = convSnap.data() as { userIds?: string[] } | undefined;
      const members = conv?.userIds || [];
      if (!members.includes(callerUid)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!targetUserIds.length) {
        targetUserIds = members.filter((id) => id !== callerUid);
      } else {
        targetUserIds = targetUserIds.filter((id) => members.includes(id) && id !== callerUid);
      }
    }

    if (!targetUserIds.length) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const tokenDocs = await Promise.all(
      targetUserIds.map((uid) => db.collection('fcm_tokens').doc(uid).get())
    );
    const userDocs = await Promise.all(
      targetUserIds.map((uid) => db.collection('users').doc(uid).get())
    );

    const tokenSet = new Set<string>();
    tokenDocs.forEach((snap) => {
      if (!snap.exists) return;
      const data = snap.data() as { tokens?: string[] } | undefined;
      if (Array.isArray(data?.tokens)) {
        data.tokens.filter(Boolean).forEach((token) => tokenSet.add(token));
      }
    });
    userDocs.forEach((snap) => {
      if (!snap.exists) return;
      const data = snap.data() as { fcmToken?: string } | undefined;
      if (typeof data?.fcmToken === 'string' && data.fcmToken.trim()) {
        tokenSet.add(data.fcmToken);
      }
    });

    const tokens = Array.from(tokenSet);
    if (!tokens.length) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const title = body.title || (body.type === 'message' ? 'New message' : body.type === 'match' ? "It's a Match!" : 'Shift update');
    const notifBody = body.body || (body.type === 'message' ? 'You received a new message.' : body.type === 'match' ? 'You have a new match.' : 'A shift has been updated.');
    const link = body.link || (body.conversationId ? `/families/messages/${body.conversationId}` : '/families/messages');

    const response = await adminMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body: notifBody },
      data: {
        link,
        type: body.type,
      },
      webpush: {
        fcmOptions: { link },
      },
    });

    return NextResponse.json({
      ok: true,
      sent: response.successCount,
      failed: response.failureCount,
    });
  } catch (error) {
    console.error('Notify API error:', error);
    return NextResponse.json({ error: 'Could not send notifications.' }, { status: 500 });
  }
}
