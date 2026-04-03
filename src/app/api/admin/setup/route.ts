import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { getAdminVerificationEmails } from '@/lib/admin/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const providedSecret = request.headers.get('x-admin-secret') || '';
  const expectedSecret = process.env.ADMIN_SETUP_SECRET || '';

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auth = adminAuth();
  const emails = getAdminVerificationEmails();
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const email of emails) {
    try {
      const userRecord = await auth.getUserByEmail(email);
      if (userRecord.customClaims?.role === 'admin') {
        skipped.push(email);
        continue;
      }

      await auth.setCustomUserClaims(userRecord.uid, {
        ...(userRecord.customClaims || {}),
        role: 'admin',
      });
      updated.push(email);
    } catch (error) {
      console.error(`admin setup skipped for ${email}:`, error);
      skipped.push(email);
    }
  }

  return NextResponse.json({ ok: true, updated, skipped });
}
