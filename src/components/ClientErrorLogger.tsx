'use client';

import { useEffect } from 'react';

type ErrorPayload = {
  type: 'error' | 'unhandledrejection';
  message: string;
  stack?: string | null;
  source?: string | null;
  line?: number | null;
  col?: number | null;
  url?: string | null;
  userAgent?: string | null;
  time?: string;
};

const MAX_FIELD_LENGTH = 2000;

const trimValue = (value: unknown, max = MAX_FIELD_LENGTH) => {
  if (value == null) return '';
  try {
    const asString =
      typeof value === 'string' ? value : JSON.stringify(value);
    if (!asString) return String(value);
    return asString.length > max ? `${asString.slice(0, max)}…` : asString;
  } catch {
    const fallback = String(value);
    return fallback.length > max ? `${fallback.slice(0, max)}…` : fallback;
  }
};

const postError = (payload: ErrorPayload) => {
  try {
    const body = JSON.stringify({
      ...payload,
      time: new Date().toISOString(),
    });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/client-error', blob);
      return;
    }
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // Intentionally ignore logging failures.
  }
};

export default function ClientErrorLogger() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const windowWithFlag = window as typeof window & { __ssClientErrorLogger?: boolean };
    if (windowWithFlag.__ssClientErrorLogger) return;
    windowWithFlag.__ssClientErrorLogger = true;

    const onError = (event: ErrorEvent) => {
      const error = event.error as Error | undefined;
      postError({
        type: 'error',
        message: trimValue(event.message || error?.message || 'Unknown error'),
        stack: trimValue(error?.stack || ''),
        source: trimValue(event.filename || ''),
        line: typeof event.lineno === 'number' ? event.lineno : null,
        col: typeof event.colno === 'number' ? event.colno : null,
        url: trimValue(window.location.href),
        userAgent: trimValue(navigator.userAgent),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as Error | unknown;
      const message =
        reason instanceof Error
          ? reason.message
          : trimValue(reason) || 'Unhandled rejection';
      const stack = reason instanceof Error ? reason.stack : '';
      postError({
        type: 'unhandledrejection',
        message: trimValue(message),
        stack: trimValue(stack || ''),
        url: trimValue(window.location.href),
        userAgent: trimValue(navigator.userAgent),
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
