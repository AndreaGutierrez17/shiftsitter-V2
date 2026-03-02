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
    const [usersSnap, auditSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('verification_audit').get().catch(() => null),
    ]);
    const attemptsByUid = new Map<string, { attempts: number; rejections: number }>();

    auditSnap?.docs.forEach((doc) => {
      const data = doc.data() as { targetUid?: unknown; action?: unknown } | undefined;
      const targetUid = String(data?.targetUid || '');
      if (!targetUid) return;
      const current = attemptsByUid.get(targetUid) || { attempts: 0, rejections: 0 };
      current.attempts += 1;
      if (String(data?.action || '') === 'reject') current.rejections += 1;
      attemptsByUid.set(targetUid, current);
    });

    const users = usersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u: any) => {
        const status = String(u.verificationStatus || 'unverified');
        const hasIdFront = typeof u.idFrontUrl === 'string' && u.idFrontUrl.trim().length > 0;
        const hasSelfie = typeof u.selfieUrl === 'string' && u.selfieUrl.trim().length > 0;
        const hasVerificationDocs = hasIdFront || hasSelfie;
        return hasVerificationDocs && ['pending', 'rejected', 'unverified', 'verified'].includes(status);
      })
      .map((u: any) => {
        const attempts = attemptsByUid.get(String(u.id || '')) || { attempts: 0, rejections: 0 };
        return {
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
          verificationAttemptCount: Math.max(1, attempts.attempts),
          rejectionCount: attempts.rejections,
        };
      })
      .sort((a: any, b: any) => {
        const rank = (s: string) => (s === 'pending' ? 0 : s === 'rejected' ? 1 : s === 'unverified' ? 2 : 3);
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

    if (body.verificationStatus === 'verified' || body.verificationStatus === 'rejected') {
      const notificationId = `verification_${body.verificationStatus}_${body.userId}_${Date.now()}`;
      await db
        .collection('notifications')
        .doc(body.userId)
        .collection('items')
        .doc(notificationId)
        .set(
          {
            type: 'verification',
            title: body.verificationStatus === 'verified' ? 'Verification Approved' : 'Verification Rejected',
            body:
              body.verificationStatus === 'verified'
                ? 'Your account has been verified successfully.'
                : 'Your account has been rejected. Please upload your documents again.',
            href:
              body.verificationStatus === 'verified'
                ? `/families/profile/${body.userId}`
                : '/families/profile/edit',
            read: false,
            readAt: null,
            createdAt: new Date(),
            data: {
              verificationStatus: body.verificationStatus,
            },
          },
          { merge: true }
        );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('admin verification PATCH error:', error);
    return NextResponse.json({ error: 'Could not update verification status.' }, { status: 500 });
  }
}
