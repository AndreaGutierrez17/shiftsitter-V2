import { NextResponse } from 'next/server';
import { verifyAdminSessionCookie, verifyBearerToken } from '@/lib/admin/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const verified = await verifyBearerToken(request);
    if (!verified) {
      const session = await verifyAdminSessionCookie();
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      return NextResponse.json({
        uid: session.uid,
        email: session.email || null,
        role: session.role || null,
      });
    }

    if (!verified) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      uid: verified.decoded.uid,
      email: verified.decoded.email || null,
      role: verified.decoded.role || null,
    });
  } catch (error) {
    console.error('admin whoami error:', error);
    return NextResponse.json({ error: 'Could not verify admin identity.' }, { status: 500 });
  }
}
