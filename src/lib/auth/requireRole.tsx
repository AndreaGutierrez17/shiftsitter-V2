'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';

type UserRoleDoc = {
  accountType?: 'family' | 'employer';
  role?: string;
};

const FAMILY_ROLES = new Set(['family', 'parent', 'sitter', 'reciprocal']);

function normalizeRole(data: UserRoleDoc | null): 'family' | 'employer' | null {
  if (!data) return null;
  if (data.accountType === 'employer') return 'employer';
  if (data.accountType === 'family') return 'family';
  if (typeof data.role === 'string' && FAMILY_ROLES.has(data.role)) return 'family';
  return null;
}

export function useRequireRole(expected: 'family' | 'employer') {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [roleData, setRoleData] = useState<UserRoleDoc | null | undefined>(undefined);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace(expected === 'employer' ? '/employers/login' : '/families');
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        setRoleData(snapshot.exists() ? (snapshot.data() as UserRoleDoc) : null);
      },
      () => {
        setRoleData(null);
      }
    );

    return () => unsubscribe();
  }, [authLoading, expected, router, user]);

  const normalizedRole = useMemo(() => normalizeRole(roleData ?? null), [roleData]);

  useEffect(() => {
    if (authLoading || typeof roleData === 'undefined' || !user) return;

    if (!normalizedRole) {
      router.replace('/account/setup');
      return;
    }

    if (normalizedRole !== expected) {
      router.replace(normalizedRole === 'employer' ? '/employers/dashboard' : '/families/match');
    }
  }, [authLoading, expected, normalizedRole, roleData, router, user]);

  return {
    user,
    loading: authLoading || typeof roleData === 'undefined',
    role: normalizedRole,
    profile: roleData ?? null,
  };
}

export function RequireRole({
  role,
  children,
}: {
  role: 'family' | 'employer';
  children: React.ReactNode;
}) {
  const state = useRequireRole(role);

  if (state.loading || !state.user || state.role !== role) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
