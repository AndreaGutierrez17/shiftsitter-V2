import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
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
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = adminDb();
    const snap = await db
      .collection('notifications')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const items = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        userId: String(data.userId || ''),
        type: String(data.type || 'system'),
        title: String(data.title || 'Notification'),
        body: String(data.body || ''),
        href: typeof data.href === 'string' ? data.href : null,
        createdAt: data.createdAt ?? null,
        readAt: data.readAt ?? null,
      };
    });

    return NextResponse.json({
      items,
      unreadCount: items.filter((item) => !item.readAt).length,
    });
  } catch (error) {
    console.error('notifications GET error:', error);
    return NextResponse.json({ error: 'Could not load notifications.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as { id?: string; markAll?: boolean };
    const db = adminDb();

    if (body.markAll) {
      const snap = await db
        .collection('notifications')
        .where('userId', '==', uid)
        .where('readAt', '==', null)
        .get();
      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.update(doc.ref, { readAt: FieldValue.serverTimestamp() });
      });
      await batch.commit();
      return NextResponse.json({ ok: true });
    }

    if (!body.id) {
      return NextResponse.json({ error: 'Missing notification id' }, { status: 400 });
    }

    const ref = db.collection('notifications').doc(body.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const data = snap.data() as { userId?: string } | undefined;
    if (data?.userId !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await ref.set({ readAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('notifications PATCH error:', error);
    return NextResponse.json({ error: 'Could not update notification.' }, { status: 500 });
  }
}
