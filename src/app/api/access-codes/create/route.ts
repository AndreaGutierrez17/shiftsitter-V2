import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type Body = {
  quantity?: number;
  expiryDays?: number | null;
};

function buildBatchFilename(createdAt: Date) {
  const yyyy = createdAt.getFullYear();
  const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
  const dd = String(createdAt.getDate()).padStart(2, '0');
  const hh = String(createdAt.getHours()).padStart(2, '0');
  const min = String(createdAt.getMinutes()).padStart(2, '0');
  return `shiftsitter-codes-${yyyy}${mm}${dd}-${hh}${min}.csv`;
}

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
    const createdAtDate = new Date();
    const createdAt = Timestamp.fromDate(createdAtDate);
    const expiresAt =
      expiryDays !== null
        ? Timestamp.fromDate(new Date(createdAtDate.getTime() + expiryDays * 24 * 60 * 60 * 1000))
        : null;
    const batchRef = db.collection('access_code_batches').doc();
    const filename = buildBatchFilename(createdAtDate);

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
        createdAt,
        batchId: batchRef.id,
      });
    });
    batch.set(batchRef, {
      employerId: callerUid,
      filename,
      quantity: nextCodes.length,
      codes: nextCodes,
      createdAt,
      expiresAt,
    });

    await batch.commit();

    return NextResponse.json({
      ok: true,
      count: nextCodes.length,
      codes: nextCodes,
      batchId: batchRef.id,
      filename,
      createdAt: createdAt.toDate().toISOString(),
      expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
    });
  } catch (error) {
    console.error('access-codes create API error:', error);
    return NextResponse.json({ error: 'Could not create access codes.' }, { status: 500 });
  }
}
