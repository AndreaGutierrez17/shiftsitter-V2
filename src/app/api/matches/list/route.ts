import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

async function getUidFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token);
  return decoded.uid;
}

export async function GET(request: Request) {
  try {
    const callerUid = await getUidFromRequest(request);
    if (!callerUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = adminDb();
    const [matchesA, matchesB, matchesUsers, matchesUserIds, conversations] = await Promise.all([
      db.collection('matches').where('uid1', '==', callerUid).get(),
      db.collection('matches').where('uid2', '==', callerUid).get(),
      db.collection('matches').where('users', 'array-contains', callerUid).get(),
      db.collection('matches').where('userIds', 'array-contains', callerUid).get(),
      db.collection('conversations').where('userIds', 'array-contains', callerUid).get(),
    ]);

    const conversationByOtherUser = new Map<
      string,
      {
        id: string;
        lastMessage: string;
        lastMessageAt: number | null;
      }
    >();

    for (const row of conversations.docs) {
      const data = row.data() as {
        userIds?: string[];
        lastMessage?: string;
        lastMessageAt?: { toMillis?: () => number };
      };
      const members = Array.isArray(data.userIds) ? data.userIds : [];
      const otherUserId = members.find((uid) => uid !== callerUid);
      if (!otherUserId) continue;

      conversationByOtherUser.set(otherUserId, {
        id: row.id,
        lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
        lastMessageAt: typeof data.lastMessageAt?.toMillis === 'function' ? data.lastMessageAt.toMillis() : null,
      });
    }

    const allMatchDocs = [
      ...matchesA.docs,
      ...matchesB.docs,
      ...matchesUsers.docs,
      ...matchesUserIds.docs,
    ];

    const uniqueMatchDocs = Array.from(new Map(allMatchDocs.map((row) => [row.id, row])).values());

    const matchOtherUserIds = uniqueMatchDocs
      .map((row) => {
        const data = row.data() as {
          uid1?: string;
          uid2?: string;
          users?: string[];
          userIds?: string[];
        };

        if (data.uid1 || data.uid2) {
          return data.uid1 === callerUid ? data.uid2 : data.uid1;
        }

        const members = Array.isArray(data.userIds)
          ? data.userIds
          : Array.isArray(data.users)
            ? data.users
            : [];

        return members.find((uid) => uid !== callerUid);
      })
      .filter((uid): uid is string => Boolean(uid));

    const conversationOtherUserIds = Array.from(conversationByOtherUser.keys());

    const otherUserIds = Array.from(new Set([...matchOtherUserIds, ...conversationOtherUserIds]));

    const userDocs = await Promise.all(otherUserIds.map((uid) => db.collection('users').doc(uid).get()));
    const usersById = new Map(
      userDocs
        .filter((row) => row.exists)
        .map((row) => [row.id, row.data() as Record<string, unknown>])
    );

    const rows = otherUserIds
      .map((otherUserId) => {
        const userData = usersById.get(otherUserId);
        if (!userData) return null;

        return {
          id: `${callerUid}_${otherUserId}`,
          otherUser: {
            id: otherUserId,
            name: typeof userData.name === 'string' ? userData.name : 'Unknown user',
            location: typeof userData.location === 'string' ? userData.location : '',
            photoURLs: Array.isArray(userData.photoURLs) ? userData.photoURLs : [],
          },
          conversation: conversationByOtherUser.get(otherUserId) || null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('matches list API error:', error);
    return NextResponse.json({ error: 'Could not load matches.' }, { status: 500 });
  }
}
