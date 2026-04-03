'use client';

import { useEffect, useRef } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const PRESENCE_HEARTBEAT_MS = 60_000;
const MIN_PRESENCE_WRITE_GAP_MS = 45_000;

export function useUserPresenceHeartbeat(uid?: string | null) {
  const lastPresenceWriteAtRef = useRef(0);

  useEffect(() => {
    if (!uid || typeof window === 'undefined') return;

    let cancelled = false;
    let intervalId: number | null = null;

    const persistPresence = async (force = false) => {
      if (cancelled) return;

      const now = Date.now();
      if (!force && now - lastPresenceWriteAtRef.current < MIN_PRESENCE_WRITE_GAP_MS) {
        return;
      }

      lastPresenceWriteAtRef.current = now;

      try {
        await updateDoc(doc(db, 'users', uid), {
          lastSeen: serverTimestamp(),
        });
      } catch (error) {
        console.error('Presence heartbeat failed:', error);
      }
    };

    const handleVisibilityChange = () => {
      void persistPresence(true);
    };

    const handleFocus = () => {
      void persistPresence(true);
    };

    void persistPresence(true);

    intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void persistPresence();
      }
    }, PRESENCE_HEARTBEAT_MS);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleFocus);
    window.addEventListener('pagehide', handleFocus);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleFocus);
      window.removeEventListener('pagehide', handleFocus);
      void persistPresence(true);
    };
  }, [uid]);
}
