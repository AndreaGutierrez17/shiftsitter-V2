'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';

type UserDoc = {
  accountType?: string;
  role?: string;
};

export default function EmployerRedeemPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/employers/login');
      return;
    }

    void (async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) {
        router.replace('/account/setup');
        return;
      }

      const data = snap.data() as UserDoc;
      if (data.accountType === 'employer') {
        router.replace('/employers/dashboard');
        return;
      }
    })();
  }, [loading, router, user]);

  const handleRedeem = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || busy) return;

    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setError('Enter an access code first.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/access-codes/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          code: normalizedCode,
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error || 'invalid');
      }

      router.replace('/families/onboarding/questions');
    } catch (redeemError) {
      const message = redeemError instanceof Error ? redeemError.message : '';
      if (message === 'expired') {
        setError('This access code has expired.');
      } else if (message === 'family_only') {
        setError('Only family accounts can redeem an employer access code.');
      } else {
        setError('This code is invalid, already used, or no longer active.');
      }
    } finally {
      setBusy(false);
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
    <div className="auth-shell" lang="en" translate="no">
      <Card className="auth-card" style={{ maxWidth: '720px' }}>
        <CardHeader className="auth-card-head">
          <CardTitle>Redeem employer access code</CardTitle>
          <CardDescription>Enter the code from your employer to unlock the family onboarding flow.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleRedeem}>
            <div className="form-field">
              <label>Access code</label>
              <input
                className="ss-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="SS-AB12-CD34"
                autoCapitalize="characters"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="ss-pill-btn" disabled={busy}>
                {busy ? 'Checking code...' : 'Redeem code'}
              </Button>
              <Button type="button" variant="outline" className="ss-btn-outline" onClick={() => router.push('/families/onboarding')} disabled={busy}>
                Continue without a code
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
