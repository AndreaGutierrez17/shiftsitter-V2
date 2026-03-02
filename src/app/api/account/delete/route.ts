import { NextResponse } from 'next/server';
import { FieldValue, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

async function getUidFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token);
  return decoded.uid;
}

async function deleteSnapshots(snapshots: QueryDocumentSnapshot[]) {
  if (snapshots.length === 0) return;
  const db = adminDb();

  for (let index = 0; index < snapshots.length; index += 400) {
    const batch = db.batch();
    snapshots.slice(index, index + 400).forEach((snapshot) => {
      batch.delete(snapshot.ref);
    });
    await batch.commit();
  }
}

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = adminDb();
    const userRef = db.collection('users').doc(uid);
    const profileRef = db.collection('profiles').doc(uid);
    const notificationsRootRef = db.collection('notifications').doc(uid);

    const userSnap = await userRef.get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    await db.collection('account_deletions').add({
      uid,
      email: String(userData.email || ''),
      name: String(userData.name || ''),
      accountType: String(userData.accountType || ''),
      role: String(userData.role || ''),
      verificationStatus: String(userData.verificationStatus || 'unknown'),
      photoCount: Array.isArray(userData.photoURLs) ? userData.photoURLs.length : 0,
      source: 'self_service',
      deletedAt: FieldValue.serverTimestamp(),
    });

    const [
      topLevelNotificationsSnap,
      conversationsSnap,
      shiftsByUserIdsSnap,
      shiftsByProposerSnap,
      shiftsByAccepterSnap,
      reviewsByReviewerSnap,
      reviewsByRevieweeSnap,
      matchesByUserIdsSnap,
      matchesByUidsSnap,
      matchesByUid1Snap,
      matchesByUid2Snap,
      swipesBySwiperSnap,
      swipesBySwipedSnap,
      likesByFromSnap,
      likesByToSnap,
      rejectsByFromSnap,
      rejectsByToSnap,
    ] = await Promise.all([
      db.collection('notifications').where('userId', '==', uid).get().catch(() => null),
      db.collection('conversations').where('userIds', 'array-contains', uid).get().catch(() => null),
      db.collection('shifts').where('userIds', 'array-contains', uid).get().catch(() => null),
      db.collection('shifts').where('proposerId', '==', uid).get().catch(() => null),
      db.collection('shifts').where('accepterId', '==', uid).get().catch(() => null),
      db.collection('reviews').where('reviewerId', '==', uid).get().catch(() => null),
      db.collection('reviews').where('revieweeId', '==', uid).get().catch(() => null),
      db.collection('matches').where('userIds', 'array-contains', uid).get().catch(() => null),
      db.collection('matches').where('uids', 'array-contains', uid).get().catch(() => null),
      db.collection('matches').where('uid1', '==', uid).get().catch(() => null),
      db.collection('matches').where('uid2', '==', uid).get().catch(() => null),
      db.collection('swipes').where('swiperId', '==', uid).get().catch(() => null),
      db.collection('swipes').where('swipedId', '==', uid).get().catch(() => null),
      db.collection('likes').where('from', '==', uid).get().catch(() => null),
      db.collection('likes').where('to', '==', uid).get().catch(() => null),
      db.collection('rejects').where('from', '==', uid).get().catch(() => null),
      db.collection('rejects').where('to', '==', uid).get().catch(() => null),
    ]);

    const docMap = new Map<string, QueryDocumentSnapshot>();
    [
      ...(topLevelNotificationsSnap?.docs || []),
      ...(shiftsByUserIdsSnap?.docs || []),
      ...(shiftsByProposerSnap?.docs || []),
      ...(shiftsByAccepterSnap?.docs || []),
      ...(reviewsByReviewerSnap?.docs || []),
      ...(reviewsByRevieweeSnap?.docs || []),
      ...(matchesByUserIdsSnap?.docs || []),
      ...(matchesByUidsSnap?.docs || []),
      ...(matchesByUid1Snap?.docs || []),
      ...(matchesByUid2Snap?.docs || []),
      ...(swipesBySwiperSnap?.docs || []),
      ...(swipesBySwipedSnap?.docs || []),
      ...(likesByFromSnap?.docs || []),
      ...(likesByToSnap?.docs || []),
      ...(rejectsByFromSnap?.docs || []),
      ...(rejectsByToSnap?.docs || []),
    ].forEach((snapshot) => {
      docMap.set(snapshot.ref.path, snapshot);
    });

    await Promise.all([
      ...(conversationsSnap?.docs || []).map((snapshot) => db.recursiveDelete(snapshot.ref)),
      db.recursiveDelete(notificationsRootRef).catch(() => undefined),
    ]);

    await deleteSnapshots(Array.from(docMap.values()));

    await Promise.all([
      userRef.delete().catch(() => undefined),
      profileRef.delete().catch(() => undefined),
    ]);

    try {
      await adminAuth().deleteUser(uid);
    } catch (error) {
      const code = String((error as { code?: unknown })?.code || '');
      if (code !== 'auth/user-not-found') {
        throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('account delete error:', error);
    return NextResponse.json({ error: 'Could not delete account.' }, { status: 500 });
  }
}
