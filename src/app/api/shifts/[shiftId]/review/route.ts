import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

type Body = {
  rating?: number;
  comment?: string;
  revieweeUid?: string;
};

async function getUidFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token);
  return decoded.uid;
}

function toIso(value: unknown) {
  const ts = value as { toDate?: () => Date } | undefined;
  return typeof ts?.toDate === 'function' ? ts.toDate().toISOString() : null;
}

export async function POST(request: Request, context: { params: Promise<{ shiftId: string }> }) {
  try {
    const currentUid = await getUidFromRequest(request);
    if (!currentUid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { shiftId } = await context.params;
    if (!shiftId) return NextResponse.json({ error: 'Missing shiftId' }, { status: 400 });

    const body = (await request.json()) as Body;
    const rating = Number(body.rating);
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 280) : '';
    const revieweeUid = typeof body.revieweeUid === 'string' ? body.revieweeUid.trim() : '';

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5.' }, { status: 400 });
    }
    if (!revieweeUid) {
      return NextResponse.json({ error: 'Missing revieweeUid.' }, { status: 400 });
    }

    const db = adminDb();
    const reviewDocId = `${shiftId}_${currentUid}`;
    const reviewRef = db.collection('reviews').doc(reviewDocId);
    const shiftRef = db.collection('shifts').doc(shiftId);
    const revieweeRef = db.collection('users').doc(revieweeUid);
    const reviewerRef = db.collection('users').doc(currentUid);

    const txResult = await db.runTransaction(async (tx) => {
      const [existingReviewSnap, shiftSnap, revieweeSnap, reviewerSnap] = await Promise.all([
        tx.get(reviewRef),
        tx.get(shiftRef),
        tx.get(revieweeRef),
        tx.get(reviewerRef),
      ]);

      if (existingReviewSnap.exists) {
        throw new Error('DUPLICATE_REVIEW');
      }
      if (!shiftSnap.exists) {
        throw new Error('SHIFT_NOT_FOUND');
      }

      const shift = shiftSnap.data() as Record<string, unknown>;
      const status = String(shift.status || '');
      const proposerId = String(shift.proposerId || '');
      const accepterId = String(shift.accepterId || '');
      const userIds = Array.isArray(shift.userIds) ? (shift.userIds as unknown[]).map(String) : [proposerId, accepterId].filter(Boolean);

      if (status !== 'completed') throw new Error('SHIFT_NOT_COMPLETED');
      if (!userIds.includes(currentUid)) throw new Error('NOT_IN_SHIFT');
      if (!userIds.includes(revieweeUid) || revieweeUid === currentUid) throw new Error('INVALID_REVIEWEE');
      if (shift.status === 'cancelled') throw new Error('SHIFT_CANCELLED');

      const reviewerRole = String((reviewerSnap.data() as { role?: string } | undefined)?.role || '');
      const currentAggregates = (revieweeSnap.data() as {
        avgRating?: number;
        reviewCount?: number;
        ratingBreakdown?: Record<string, number>;
        averageRating?: number;
        ratingCount?: number;
      } | undefined) || {};

      const prevCount = Number.isFinite(currentAggregates.reviewCount) ? Number(currentAggregates.reviewCount) : (
        Number.isFinite(currentAggregates.ratingCount) ? Number(currentAggregates.ratingCount) : 0
      );
      const prevAvg = Number.isFinite(currentAggregates.avgRating) ? Number(currentAggregates.avgRating) : (
        Number.isFinite(currentAggregates.averageRating) ? Number(currentAggregates.averageRating) : 0
      );
      const nextCount = prevCount + 1;
      const nextAvgRaw = ((prevAvg * prevCount) + rating) / nextCount;
      const nextAvg = Math.round(nextAvgRaw * 100) / 100;

      const existingBreakdown = currentAggregates.ratingBreakdown || {};
      const nextBreakdown = {
        1: Number(existingBreakdown['1'] || 0),
        2: Number(existingBreakdown['2'] || 0),
        3: Number(existingBreakdown['3'] || 0),
        4: Number(existingBreakdown['4'] || 0),
        5: Number(existingBreakdown['5'] || 0),
      };
      nextBreakdown[rating as 1 | 2 | 3 | 4 | 5] += 1;

      tx.create(reviewRef, {
        shiftId,
        reviewerUid: currentUid,
        revieweeUid,
        reviewerId: currentUid, // compatibility
        revieweeId: revieweeUid, // compatibility
        rating,
        comment: comment || null,
        createdAt: FieldValue.serverTimestamp(),
        roleContext: reviewerRole || null,
        visibility: 'public',
        metadata: {
          startAt: toIso(shift.startAt),
          endAt: toIso(shift.endAt),
        },
      });

      tx.set(revieweeRef, {
        avgRating: nextAvg,
        reviewCount: nextCount,
        averageRating: nextAvg, // compatibility with existing UI fields
        ratingCount: nextCount, // compatibility
        ratingBreakdown: nextBreakdown,
        lastReviewAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { ok: true, reviewId: reviewDocId, avgRating: nextAvg, reviewCount: nextCount };
    });

    return NextResponse.json(txResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not submit review.';
    if (message === 'DUPLICATE_REVIEW') return NextResponse.json({ error: 'You already reviewed this shift.' }, { status: 409 });
    if (message === 'SHIFT_NOT_FOUND') return NextResponse.json({ error: 'Shift not found.' }, { status: 404 });
    if (message === 'SHIFT_NOT_COMPLETED') return NextResponse.json({ error: 'Reviews are only allowed for completed shifts.' }, { status: 400 });
    if (message === 'NOT_IN_SHIFT') return NextResponse.json({ error: 'You are not part of this shift.' }, { status: 403 });
    if (message === 'INVALID_REVIEWEE') return NextResponse.json({ error: 'Invalid reviewee.' }, { status: 400 });
    if (message === 'SHIFT_CANCELLED') return NextResponse.json({ error: 'Cancelled shifts cannot be reviewed.' }, { status: 400 });
    console.error('shift review API error:', error);
    return NextResponse.json({ error: 'Could not submit review.' }, { status: 500 });
  }
}

