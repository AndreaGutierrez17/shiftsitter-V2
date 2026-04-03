'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Timestamp, collection, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { useRequireRole } from '@/lib/auth/requireRole';
import { useToast } from '@/hooks/use-toast';

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

type RedeemedUserInfo = {
  name: string;
  email: string;
};

function formatTimestamp(value?: Timestamp | null) {
  return typeof value?.toDate === 'function' ? value.toDate().toLocaleString() : '--';
}

function formatStatusLabel(status: AccessCodeDoc['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function EmployerCodesPage() {
  const guard = useRequireRole('employer');
  const { user } = useAuth();
  const { toast } = useToast();
  const [codes, setCodes] = useState<AccessCodeDoc[]>([]);
  const [redeemedUsers, setRedeemedUsers] = useState<Record<string, RedeemedUserInfo>>({});
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

  useEffect(() => {
    const redeemedIds = Array.from(
      new Set(codes.map((row) => row.redeemedBy).filter((value): value is string => Boolean(value)))
    );

    if (redeemedIds.length === 0) {
      setRedeemedUsers({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const nextEntries = await Promise.all(
        redeemedIds.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            const data = snap.exists() ? (snap.data() as { name?: string; email?: string }) : {};
            return [uid, { name: data.name || 'Unknown user', email: data.email || 'No email' }] as const;
          } catch {
            return [uid, { name: 'Unknown user', email: 'No email' }] as const;
          }
        })
      );

      if (!cancelled) {
        setRedeemedUsers(Object.fromEntries(nextEntries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [codes]);

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

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            codes?: string[];
            filename?: string;
            createdAt?: string;
            expiresAt?: string | null;
          }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || 'Could not create access codes.');
      }

      const nextCodes = Array.isArray(payload?.codes) ? payload.codes : [];
      if (nextCodes.length > 0) {
        downloadCsv(
          [
            ['Code', 'Created On', 'Expires On'],
            ...nextCodes.map((code) => [
              code,
              payload?.createdAt ? new Date(payload.createdAt).toLocaleString() : '',
              payload?.expiresAt ? new Date(payload.expiresAt).toLocaleString() : 'No expiration',
            ]),
          ],
          payload?.filename || `shiftsitter-codes-${Date.now()}.csv`
        );
      }

      toast({
        title: 'Code batch created',
        description: `${nextCodes.length} codes were generated and the file download started.`,
      });
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
            <CardTitle className="font-headline">Codes</CardTitle>
            <CardDescription>Create batches, track redemptions, and revoke access when needed.</CardDescription>
          </CardHeader>
          <div className="mx-6 h-0.5 rounded-full bg-emerald-300/80" />
          <CardContent className="pt-6">
            <form className="grid gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-4" onSubmit={handleCreateCodes}>
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
              <div className="sm:col-span-2 xl:col-span-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button type="submit" className="ss-pill-btn w-full sm:w-auto" disabled={creating}>
                  {creating ? 'Creating...' : 'Create codes'}
                </Button>
              </div>
              {error ? <p className="sm:col-span-2 xl:col-span-4 text-sm text-destructive">{error}</p> : null}
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
              <>
                <div className="grid gap-3 lg:hidden">
                  {codes.map((row) => {
                    const redeemedUser = row.redeemedBy ? redeemedUsers[row.redeemedBy] : null;
                    return (
                      <article key={row.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code</p>
                            <p className="break-all text-sm font-semibold text-[var(--navy)]">{row.code}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                              <p className="mt-1 font-medium text-foreground">{formatStatusLabel(row.status)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Redeemed On</p>
                              <p className="mt-1 text-foreground">
                                {typeof row.redeemedAt?.toDate === 'function' ? row.redeemedAt.toDate().toLocaleString() : '--'}
                              </p>
                            </div>
                          </div>
                          <div className="grid gap-3 text-sm">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created On</p>
                              <p className="mt-1 text-foreground">{formatTimestamp(row.createdAt)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expires On</p>
                              <p className="mt-1 text-foreground">{formatTimestamp(row.expiresAt)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Redeemed By</p>
                              {redeemedUser ? (
                                <div className="mt-1">
                                  <p className="font-medium text-foreground">{redeemedUser.name || 'Loading...'}</p>
                                  <p className="text-xs text-muted-foreground">{redeemedUser.email || ''}</p>
                                </div>
                              ) : (
                                <p className="mt-1 text-foreground">--</p>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="ss-btn-outline w-full text-rose-500 hover:text-rose-600 disabled:opacity-50"
                            onClick={() => handleRevoke(row)}
                            disabled={row.status !== 'active'}
                          >
                            Revoke
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto lg:block">
                  <table className="min-w-[920px] w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-3 py-3 font-medium">Code</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-3 py-3 font-medium">Created On</th>
                        <th className="px-3 py-3 font-medium">Expires On</th>
                        <th className="px-3 py-3 font-medium">Redeemed By</th>
                        <th className="px-3 py-3 font-medium">Redeemed On</th>
                        <th className="px-3 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="px-3 py-3 font-medium text-[var(--navy)]">{row.code}</td>
                          <td className="px-3 py-3">{formatStatusLabel(row.status)}</td>
                          <td className="px-3 py-3">{formatTimestamp(row.createdAt)}</td>
                          <td className="px-3 py-3">{formatTimestamp(row.expiresAt)}</td>
                          <td className="px-3 py-3">
                            {row.redeemedBy ? (
                              <div>
                                <p className="font-medium text-foreground">{redeemedUsers[row.redeemedBy]?.name || 'Loading...'}</p>
                                <p className="text-xs text-muted-foreground">{redeemedUsers[row.redeemedBy]?.email || ''}</p>
                              </div>
                            ) : '--'}
                          </td>
                          <td className="px-3 py-3">
                            {typeof row.redeemedAt?.toDate === 'function' ? row.redeemedAt.toDate().toLocaleString() : '--'}
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
