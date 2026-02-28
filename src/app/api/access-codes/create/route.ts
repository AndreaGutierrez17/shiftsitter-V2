import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type Body = {
  quantity?: number;
  expiryDays?: number | null;
};

async function getUidFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token);
  return decoded.uid;
}

function generateVisibleCode() {
  const block = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  return `SS-${block()}-${block()}`;
}

async function generateUniqueCodes(quantity: number) {
  const db = adminDb();
  const codes = new Set<string>();

  while (codes.size < quantity) {
    const candidate = generateVisibleCode();
    if (codes.has(candidate)) continue;

    const existing = await db.collection('access_codes').where('code', '==', candidate).limit(1).get();
    if (!existing.empty) continue;

    codes.add(candidate);
  }

  return Array.from(codes);
}

export async function POST(request: Request) {
  try {
    const callerUid = await getUidFromRequest(request);
    if (!callerUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const quantity = Number(body.quantity || 0);
    const expiryDays = body.expiryDays == null ? null : Number(body.expiryDays);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      return NextResponse.json({ error: 'Quantity must be between 1 and 500.' }, { status: 400 });
    }

    if (expiryDays !== null && (!Number.isFinite(expiryDays) || expiryDays < 1)) {
      return NextResponse.json({ error: 'Expiration must be at least 1 day if provided.' }, { status: 400 });
    }

    const db = adminDb();
    const userSnap = await db.collection('users').doc(callerUid).get();
    const accountType = userSnap.exists ? userSnap.data()?.accountType : null;
    if (accountType !== 'employer') {
      return NextResponse.json({ error: 'Employer access required.' }, { status: 403 });
    }

    const nextCodes = await generateUniqueCodes(quantity);
    const expiresAt =
      expiryDays !== null
        ? Timestamp.fromDate(new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000))
        : null;

    const batch = db.batch();
    nextCodes.forEach((code) => {
      const ref = db.collection('access_codes').doc();
      batch.set(ref, {
        code,
        employerId: callerUid,
        status: 'active',
        redeemedBy: null,
        redeemedAt: null,
        expiresAt,
        createdAt: Timestamp.now(),
      });
    });

    await batch.commit();

    return NextResponse.json({ ok: true, count: nextCodes.length, codes: nextCodes });
  } catch (error) {
    console.error('access-codes create API error:', error);
    return NextResponse.json({ error: 'Could not create access codes.' }, { status: 500 });
  }
}
