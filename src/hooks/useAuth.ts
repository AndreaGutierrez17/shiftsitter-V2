'use client';

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

type AuthContextType = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const syncAdminSession = async (nextUser: User | null) => {
      try {
        if (!nextUser) {
          await fetch('/api/admin/session', {
            method: 'DELETE',
            credentials: 'include',
          });
          return;
        }

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const token = await nextUser.getIdToken(attempt > 0);
          const response = await fetch('/api/admin/session', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: 'include',
          });

          const payload = (await response.json().catch(() => ({}))) as { claimsUpdated?: boolean };
          if (!response.ok || !payload.claimsUpdated) {
            return;
          }

          await wait(750);
        }
      } catch (error) {
        console.error('Admin session sync failed:', error);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
      void syncAdminSession(user);
    });

    return () => unsubscribe();
  }, []);

  return React.createElement(AuthContext.Provider, { value: { user, loading } }, children);
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
