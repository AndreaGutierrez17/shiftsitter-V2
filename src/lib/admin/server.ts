import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';

const ADMIN_SESSION_COOKIE = 'ss_admin_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 5;

export function getAdminVerificationEmails() {
  const combined = [
    process.env.ADMIN_VERIFICATION_EMAILS || '',
    process.env.ADMIN_EMAIL1 || '',
    process.env.ADMIN_EMAIL2 || '',
    process.env.ADMIN_EMAIL3 || '',
  ];

  return Array.from(
    new Set(
      combined
        .flatMap((value) => value.split(','))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return getAdminVerificationEmails().includes(email.trim().toLowerCase());
}

export async function syncAdminClaimForUser(uid: string, email: string | null | undefined) {
  if (!isAdminEmail(email)) return false;

  const auth = adminAuth();
  const userRecord = await auth.getUser(uid);
  if (userRecord.customClaims?.role === 'admin') return false;

  await auth.setCustomUserClaims(uid, {
    ...(userRecord.customClaims || {}),
    role: 'admin',
  });
  return true;
}

export async function verifyBearerToken(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;

  const decoded = await adminAuth().verifyIdToken(token);
  return {
    token,
    decoded,
  };
}

export async function requireAdminBearer(request: Request) {
  const verified = await verifyBearerToken(request);
  if (!verified) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (verified.decoded.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return {
    uid: verified.decoded.uid,
    email: String(verified.decoded.email || ''),
    decoded: verified.decoded,
    token: verified.token,
  };
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export async function setAdminSessionCookie(response: NextResponse, idToken: string) {
  const sessionCookie = await adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: sessionCookie,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
}

export async function requireAdminSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!sessionCookie) {
    redirect('/families');
  }

  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, false);
    if (decoded.role !== 'admin') {
      redirect('/families');
    }

    return {
      uid: decoded.uid,
      email: String(decoded.email || ''),
      role: String(decoded.role || ''),
      decoded,
    };
  } catch {
    redirect('/families');
  }
}

export async function verifyAdminSessionCookie() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, false);
    if (decoded.role !== 'admin') return null;

    return {
      uid: decoded.uid,
      email: String(decoded.email || ''),
      role: String(decoded.role || ''),
      decoded,
    };
  } catch {
    return null;
  }
}
