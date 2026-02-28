import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

type Body = {
  code?: string;
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
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const code = body.code?.trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    const db = adminDb();
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.exists ? (userSnap.data() as { accountType?: string; role?: string }) : null;
    const isFamilyAccount =
      userData?.accountType === 'family' ||
      ['parent', 'sitter', 'reciprocal'].includes(String(userData?.role || ''));

    if (!isFamilyAccount) {
      return NextResponse.json({ error: 'family_only' }, { status: 403 });
    }

    const codeQuery = await db.collection('access_codes').where('code', '==', code).limit(1).get();
    if (codeQuery.empty) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }

    const codeRef = codeQuery.docs[0].ref;
    const codeSnap = codeQuery.docs[0];
    const data = codeSnap.data() as {
      status?: string;
      redeemedBy?: string | null;
      expiresAt?: { toDate?: () => Date } | null;
      employerId?: string;
      code?: string;
    };

    const expiresAt = data.expiresAt && typeof data.expiresAt.toDate === 'function' ? data.expiresAt.toDate() : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      await codeRef.set({ status: 'expired' }, { merge: true });
      return NextResponse.json({ error: 'expired' }, { status: 400 });
    }

    if (data.status !== 'active' || data.redeemedBy) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }

    await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(codeRef);
      if (!latest.exists) throw new Error('invalid');
      const latestData = latest.data() as { status?: string; redeemedBy?: string | null } | undefined;
      if (latestData?.status !== 'active' || latestData?.redeemedBy) throw new Error('invalid');

      transaction.set(
        codeRef,
        {
          status: 'redeemed',
          redeemedBy: uid,
          redeemedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      transaction.create(db.collection('redemptions').doc(), {
        code,
        employerId: data.employerId || null,
        userId: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid') {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    console.error('redeem code API error:', error);
    return NextResponse.json({ error: 'Could not redeem this code.' }, { status: 500 });
  }
}
