'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Timestamp, collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { useRequireRole } from '@/lib/auth/requireRole';

type AccessCodeDoc = {
  id: string;
  code: string;
  employerId: string;
  status: 'active' | 'redeemed' | 'revoked' | 'expired';
  redeemedBy?: string | null;
  redeemedAt?: Timestamp | null;
  expiresAt?: Timestamp | null;
  createdAt?: Timestamp;
};

export default function EmployerCodesPage() {
  const guard = useRequireRole('employer');
  const { user } = useAuth();
  const [codes, setCodes] = useState<AccessCodeDoc[]>([]);
  const [quantity, setQuantity] = useState(25);
  const [expiryDays, setExpiryDays] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const codesQuery = query(collection(db, 'access_codes'), where('employerId', '==', user.uid));
    const unsubscribe = onSnapshot(
      codesQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((row) => ({ id: row.id, ...row.data() } as AccessCodeDoc));
        rows.sort((a, b) => {
          const aTime = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0;
          const bTime = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });
        setCodes(rows);
      },
      (loadError) => {
        console.error('Error loading access codes:', loadError);
        setError('Could not load access codes.');
      }
    );

    return () => unsubscribe();
  }, [user]);

  const activeCount = useMemo(() => codes.filter((row) => row.status === 'active').length, [codes]);
  const redeemedCount = useMemo(() => codes.filter((row) => row.status === 'redeemed').length, [codes]);

  const handleCreateCodes = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || creating) return;

    if (quantity < 1 || quantity > 500) {
      setError('Choose a quantity between 1 and 500.');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/access-codes/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          quantity,
          expiryDays: expiryDays ? Number(expiryDays) : null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Could not create access codes.');
      }
    } catch (createError) {
      console.error('Create codes failed:', createError);
      setError(createError instanceof Error ? createError.message : 'Could not create access codes.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (row: AccessCodeDoc) => {
    if (row.status !== 'active') return;
    try {
      await setDoc(
        doc(db, 'access_codes', row.id),
        {
          status: 'revoked',
        },
        { merge: true }
      );
    } catch (revokeError) {
      console.error('Could not revoke code:', revokeError);
      setError('Could not revoke that code.');
    }
  };

  if (guard.loading || guard.role !== 'employer') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="ss-page-shell">
      <div className="ss-page-inner grid gap-5">
        <Card className="ss-soft-card">
          <CardHeader>
            <CardTitle className="font-headline">Access Codes</CardTitle>
            <CardDescription>Create batches, track redemptions, and revoke access when needed.</CardDescription>
          </CardHeader>
          <div className="mx-6 h-0.5 rounded-full bg-emerald-300/80" />
          <CardContent className="pt-6">
            <form className="grid gap-x-4 gap-y-6 md:grid-cols-4" onSubmit={handleCreateCodes}>
              <div className="form-field">
                <label>Quantity</label>
                <input
                  className="ss-input border border-emerald-300/80 bg-white shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/10"
                  type="number"
                  min={1}
                  max={500}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value || 1))}
                  disabled={creating}
                />
              </div>
              <div className="form-field">
                <label>Expires in days (optional)</label>
                <input
                  className="ss-input border border-emerald-300/80 bg-white shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/10"
                  type="number"
                  min={1}
                  placeholder="e.g. 30"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Active</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--navy)]">{activeCount}</p>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Redeemed</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--navy)]">{redeemedCount}</p>
              </div>
              <div className="md:col-span-4 flex flex-wrap gap-3">
                <Button type="submit" className="ss-pill-btn" disabled={creating}>
                  {creating ? 'Creating...' : 'Create codes'}
                </Button>
              </div>
              {error ? <p className="md:col-span-4 text-sm text-destructive">{error}</p> : null}
            </form>
            <div className="mt-6 h-0.5 w-full rounded-full bg-emerald-300/80" />
          </CardContent>
        </Card>

        <Card className="ss-soft-card">
          <CardHeader>
            <CardTitle className="font-headline">Code Inventory</CardTitle>
            <CardDescription>Review every access code you have created, along with its current status and redemption details.</CardDescription>
          </CardHeader>
          <div className="mx-6 h-0.5 rounded-full bg-emerald-300/80" />
          <CardContent className="pt-6">
            <div className="mb-5 h-0.5 w-full rounded-full bg-emerald-300/80" />
            {codes.length === 0 ? (
              <div className="rounded-2xl border bg-white p-6 text-center text-muted-foreground">
                No access codes yet. Create your first batch to start redemptions.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-3 font-medium">Code</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Redeemed by</th>
                      <th className="px-3 py-3 font-medium">Redeemed at</th>
                      <th className="px-3 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="px-3 py-3 font-medium text-[var(--navy)]">{row.code}</td>
                        <td className="px-3 py-3 capitalize">{row.status}</td>
                        <td className="px-3 py-3">{row.redeemedBy || 'â€”'}</td>
                        <td className="px-3 py-3">
                          {typeof row.redeemedAt?.toDate === 'function' ? row.redeemedAt.toDate().toLocaleString() : 'â€”'}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            className="text-rose-500 hover:text-rose-600 disabled:opacity-50"
                            onClick={() => handleRevoke(row)}
                            disabled={row.status !== 'active'}
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
