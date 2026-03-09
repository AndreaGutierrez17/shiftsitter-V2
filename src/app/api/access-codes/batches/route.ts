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
    const userSnap = await db.collection('users').doc(callerUid).get();
    const accountType = userSnap.exists ? userSnap.data()?.accountType : null;
    if (accountType !== 'employer') {
      return NextResponse.json({ error: 'Employer access required.' }, { status: 403 });
    }

    const snapshot = await db
      .collection('access_code_batches')
      .where('employerId', '==', callerUid)
      .get();

    const rows = snapshot.docs
      .map((row) => {
        const data = row.data() as {
          employerId?: string;
          filename?: string;
          quantity?: number;
          codes?: string[];
          createdAt?: { toDate?: () => Date } | null;
          expiresAt?: { toDate?: () => Date } | null;
        };

        return {
          id: row.id,
          employerId: data.employerId || callerUid,
          filename: data.filename || `shiftsitter-codes-${row.id}.csv`,
          quantity: typeof data.quantity === 'number' ? data.quantity : Array.isArray(data.codes) ? data.codes.length : 0,
          codes: Array.isArray(data.codes) ? data.codes : [],
          createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : null,
          expiresAt: data.expiresAt && typeof data.expiresAt.toDate === 'function' ? data.expiresAt.toDate().toISOString() : null,
        };
      })
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

    return NextResponse.json({ batches: rows });
  } catch (error) {
    console.error('access-code batches API error:', error);
    return NextResponse.json({ error: 'Could not load code batches.' }, { status: 500 });
  }
}
