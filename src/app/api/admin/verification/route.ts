import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function getAllowedAdminEmails() {
  const env = process.env.ADMIN_VERIFICATION_EMAILS || process.env.ADMIN_EMAILS || '';
  return env
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const decoded = await adminAuth().verifyIdToken(token);
  const email = String(decoded.email || '').toLowerCase();
  const allowlist = getAllowedAdminEmails();
  if (!email || (allowlist.length > 0 && !allowlist.includes(email))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { uid: decoded.uid, email };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if ('error' in auth) return auth.error;

    const db = adminDb();
    const snap = await db.collection('users').limit(200).get();
    const users = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u: any) => u.idFrontUrl || u.selfieUrl || u.verificationStatus)
      .map((u: any) => ({
        id: u.id,
        name: u.name || 'Unknown',
        email: u.email || null,
        verificationStatus: u.verificationStatus || 'unverified',
        idFrontUrl: u.idFrontUrl || null,
        selfieUrl: u.selfieUrl || null,
        verificationReviewNotes: u.verificationReviewNotes || '',
        verificationReviewedAt: u.verificationReviewedAt || null,
      }))
      .sort((a: any, b: any) => {
        const rank = (s: string) => (s === 'pending' ? 0 : s === 'rejected' ? 1 : s === 'verified' ? 2 : 3);
        return rank(a.verificationStatus) - rank(b.verificationStatus);
      });

    return NextResponse.json({ items: users });
  } catch (error) {
    console.error('admin verification GET error:', error);
    return NextResponse.json({ error: 'Could not load verification queue.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if ('error' in auth) return auth.error;

    const body = (await request.json()) as {
      userId?: string;
      verificationStatus?: 'pending' | 'verified' | 'rejected' | 'unverified';
      verificationReviewNotes?: string;
    };
    if (!body.userId || !body.verificationStatus) {
      return NextResponse.json({ error: 'Missing userId or verificationStatus' }, { status: 400 });
    }
    const allowed = new Set(['pending', 'verified', 'rejected', 'unverified']);
    if (!allowed.has(body.verificationStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const db = adminDb();
    await db.collection('users').doc(body.userId).set(
      {
        verificationStatus: body.verificationStatus,
        verificationReviewNotes: (body.verificationReviewNotes || '').slice(0, 280),
        verificationReviewedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('admin verification PATCH error:', error);
    return NextResponse.json({ error: 'Could not update verification status.' }, { status: 500 });
  }
}

