import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdminBearer } from '@/lib/admin/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireAdminBearer(request);
    if ('error' in auth) return auth.error;

    const db = adminDb();
    const snap = await db.collection('users').limit(200).get();
    const users = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u: any) => {
        const status = String(u.verificationStatus || 'unverified');
        const hasIdFront = typeof u.idFrontUrl === 'string' && u.idFrontUrl.trim().length > 0;
        const hasSelfie = typeof u.selfieUrl === 'string' && u.selfieUrl.trim().length > 0;
        const hasVerificationDocs = hasIdFront || hasSelfie;
        return hasVerificationDocs && ['pending', 'rejected', 'unverified'].includes(status);
      })
      .map((u: any) => ({
        id: u.id,
        name: u.name || 'Unknown',
        email: u.email || null,
        verificationStatus: u.verificationStatus || 'unverified',
        idFrontUrl: u.idFrontUrl || null,
        selfieUrl: u.selfieUrl || null,
        verificationSubmittedAt: u.verificationSubmittedAt || null,
        verificationReviewNotes: u.verificationReviewNotes || '',
        rejectReason: u.rejectReason || '',
        verificationReviewedAt: u.verificationReviewedAt || null,
      }))
      .sort((a: any, b: any) => {
        const rank = (s: string) => (s === 'pending' ? 0 : s === 'rejected' ? 1 : 2);
        const aDocs = Number(Boolean(a.idFrontUrl)) + Number(Boolean(a.selfieUrl));
        const bDocs = Number(Boolean(b.idFrontUrl)) + Number(Boolean(b.selfieUrl));
        if (rank(a.verificationStatus) !== rank(b.verificationStatus)) {
          return rank(a.verificationStatus) - rank(b.verificationStatus);
        }
        return bDocs - aDocs;
      });

    return NextResponse.json({ items: users });
  } catch (error) {
    console.error('admin verification GET error:', error);
    return NextResponse.json({ error: 'Could not load verification queue.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminBearer(request);
    if ('error' in auth) return auth.error;

    const body = (await request.json()) as {
      userId?: string;
      verificationStatus?: 'pending' | 'verified' | 'rejected' | 'unverified';
      verificationReviewNotes?: string;
      rejectReason?: string;
    };
    if (!body.userId || !body.verificationStatus) {
      return NextResponse.json({ error: 'Missing userId or verificationStatus' }, { status: 400 });
    }
    const allowed = new Set(['pending', 'verified', 'rejected', 'unverified']);
    if (!allowed.has(body.verificationStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const db = adminDb();
    const isFinalReview = body.verificationStatus === 'verified' || body.verificationStatus === 'rejected';
    await db.collection('users').doc(body.userId).set(
      {
        verificationStatus: body.verificationStatus,
        verificationReviewNotes: (body.verificationReviewNotes || '').slice(0, 280),
        rejectReason:
          body.verificationStatus === 'rejected'
            ? (body.rejectReason || body.verificationReviewNotes || '').slice(0, 280)
            : '',
        verificationReviewedAt: isFinalReview ? FieldValue.serverTimestamp() : null,
      },
      { merge: true }
    );

    await db.collection('verification_audit').add({
      targetUid: body.userId,
      action: body.verificationStatus === 'verified' ? 'approve' : body.verificationStatus === 'rejected' ? 'reject' : 'update',
      byAdminUid: auth.uid,
      byAdminEmail: auth.email,
      at: FieldValue.serverTimestamp(),
      reason:
        body.verificationStatus === 'rejected'
          ? (body.rejectReason || body.verificationReviewNotes || '').slice(0, 280)
          : (body.verificationReviewNotes || '').slice(0, 280),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('admin verification PATCH error:', error);
    return NextResponse.json({ error: 'Could not update verification status.' }, { status: 500 });
  }
}
