'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/families');
      setCheckingRole(false);
      return;
    }

    if (loading || !user) return;

    let active = true;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!active) return;
        const data = snap.exists() ? (snap.data() as { accountType?: string }) : null;
        if (data?.accountType === 'employer') {
          router.replace('/employers/dashboard');
          return;
        }
      } catch {
        // ignore
      } finally {
        if (active) setCheckingRole(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, loading, router]);

  if (loading || !user || checkingRole) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

