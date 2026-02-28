'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useRequireRole } from '@/lib/auth/requireRole';

export default function FamilyRedeemPage() {
  const guard = useRequireRole('family');
  const { user } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      } else {
        setError('This code is invalid, already used, or no longer active.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (guard.loading || guard.role !== 'family') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="ss-page-shell">
      <div className="ss-page-inner">
        <Card className="ss-soft-card" style={{ maxWidth: '720px', margin: '0 auto' }}>
          <CardHeader>
            <CardTitle className="font-headline">Redeem Employer Access Code</CardTitle>
            <CardDescription>Enter the employer code you received to unlock the family onboarding flow.</CardDescription>
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
              <div>
                <Button type="submit" className="ss-pill-btn" disabled={busy}>
                  {busy ? 'Checking code...' : 'Redeem code'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
