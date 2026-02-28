'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';

export default function AccountSetupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState<'family' | 'employer' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/families');
      return;
    }

    void (async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) return;
      const data = snap.data() as { accountType?: string; role?: string } | undefined;
      if (data?.accountType === 'employer') {
        router.replace('/employers/dashboard');
        return;
      }
      if (data?.accountType === 'family' || ['parent', 'sitter', 'reciprocal'].includes(String(data?.role || ''))) {
        router.replace('/families/match');
      }
    })();
  }, [loading, router, user]);

  const handleChoose = async (accountType: 'family' | 'employer') => {
    if (!user || saving) return;
    setSaving(accountType);
    setError(null);

    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          id: user.uid,
          email: user.email || null,
          name: user.displayName || '',
          photoURLs: user.photoURL ? [user.photoURL] : [],
          isActive: true,
          profileComplete: false,
          accountType,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      router.replace(accountType === 'employer' ? '/employers/settings' : '/families/onboarding');
    } catch (setupError) {
      console.error('Account setup failed:', setupError);
      setError('Could not save your account type. Please try again.');
      setSaving(null);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card" style={{ maxWidth: '640px' }}>
        <CardHeader className="auth-card-head">
          <CardTitle>Complete account setup</CardTitle>
          <CardDescription>Choose your access path once. This sets the correct dashboard and route protection.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              className="rounded-2xl border border-border bg-white p-5 text-left transition hover:border-primary/40 hover:bg-accent/30"
              onClick={() => handleChoose('family')}
              disabled={Boolean(saving)}
            >
              <p className="text-lg font-semibold text-[var(--navy)]">Family access</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Complete family onboarding, redeem employer codes, and use matching.
              </p>
            </button>
            <button
              type="button"
              className="rounded-2xl border border-border bg-white p-5 text-left transition hover:border-primary/40 hover:bg-accent/30"
              onClick={() => handleChoose('employer')}
              disabled={Boolean(saving)}
            >
              <p className="text-lg font-semibold text-[var(--navy)]">Employer access</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Manage company settings, create access codes, and track redemptions.
              </p>
            </button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {saving ? (
            <Button disabled className="ss-pill-btn">
              Saving...
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
