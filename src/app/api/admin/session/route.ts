import { NextResponse } from 'next/server';
import {
  clearAdminSessionCookie,
  isAdminEmail,
  setAdminSessionCookie,
  syncAdminClaimForUser,
  verifyBearerToken,
} from '@/lib/admin/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const verified = await verifyBearerToken(request);
    if (!verified) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = String(verified.decoded.email || '');
    const shouldBeAdmin = isAdminEmail(email);

    if (shouldBeAdmin && verified.decoded.role !== 'admin') {
      await syncAdminClaimForUser(verified.decoded.uid, email);
      const response = NextResponse.json({
        ok: true,
        role: 'admin',
        claimsUpdated: true,
      });
      clearAdminSessionCookie(response);
      return response;
    }

    const response = NextResponse.json({
      ok: true,
      role: shouldBeAdmin ? 'admin' : (verified.decoded.role || null),
      claimsUpdated: false,
    });

    if (verified.decoded.role === 'admin') {
      await setAdminSessionCookie(response, verified.token);
    } else {
      clearAdminSessionCookie(response);
    }

    return response;
  } catch (error) {
    console.error('admin session sync error:', error);
    const response = NextResponse.json({ error: 'Could not sync admin session.' }, { status: 500 });
    clearAdminSessionCookie(response);
    return response;
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
