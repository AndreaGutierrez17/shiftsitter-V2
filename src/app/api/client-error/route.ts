import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type ClientErrorPayload = {
  type?: string;
  message?: string;
  stack?: string;
  source?: string;
  line?: number | null;
  col?: number | null;
  url?: string;
  userAgent?: string;
  time?: string;
};

const trimValue = (value: unknown, max = 2000) => {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : String(value);
  return str.length > max ? `${str.slice(0, max)}…` : str;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as ClientErrorPayload | null;
    if (!payload) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const entry = {
      type: trimValue(payload.type || ''),
      message: trimValue(payload.message || ''),
      stack: trimValue(payload.stack || ''),
      source: trimValue(payload.source || ''),
      line: typeof payload.line === 'number' ? payload.line : null,
      col: typeof payload.col === 'number' ? payload.col : null,
      url: trimValue(payload.url || ''),
      userAgent: trimValue(payload.userAgent || ''),
      time: trimValue(payload.time || new Date().toISOString()),
    };

    console.error('[client-error]', entry);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('client-error route failed:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
