'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { useRequireRole } from '@/lib/auth/requireRole';

type AccessCodeRow = {
  id: string;
  status: 'active' | 'redeemed' | 'revoked' | 'expired';
  code: string;
};

export default function EmployerDashboardPage() {
  const guard = useRequireRole('employer');
  const { user } = useAuth();
  const [codes, setCodes] = useState<AccessCodeRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const codesQuery = query(collection(db, 'access_codes'), where('employerId', '==', user.uid));
    const unsubscribe = onSnapshot(
      codesQuery,
      (snapshot) => {
        setCodes(snapshot.docs.map((row) => ({ id: row.id, ...row.data() } as AccessCodeRow)));
        setLoadError(null);
      },
      (error) => {
        console.error('Error loading employer dashboard:', error);
        setLoadError('Could not load employer dashboard data.');
      }
    );

    return () => unsubscribe();
  }, [user]);

  const activeCount = useMemo(() => codes.filter((row) => row.status === 'active').length, [codes]);
  const redeemedCount = useMemo(() => codes.filter((row) => row.status === 'redeemed').length, [codes]);

  const handleCopyCodes = async () => {
    const visibleCodes = codes.map((row) => row.code).join('\n');
    if (!visibleCodes) return;
    try {
      await navigator.clipboard.writeText(visibleCodes);
    } catch (error) {
      console.error('Could not copy codes:', error);
    }
  };

  const handleDownloadCsv = () => {
    if (!codes.length) return;
    const rows = [
      ['Code', 'Status'],
      ...codes.map((row) => [row.code, row.status]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'shiftsitter-access-codes.csv';
    anchor.click();
    URL.revokeObjectURL(url);
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
      <div className="ss-page-inner">
        <Card className="ss-soft-card">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="font-headline">Employer Dashboard</CardTitle>
              <CardDescription>Track access codes, redemption activity, and your company setup.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/employers/codes" className="ss-btn text-center">
                Create codes
              </Link>
              <button type="button" className="ss-btn-outline" onClick={handleCopyCodes} disabled={!codes.length}>
                Copy codes
              </button>
              <button type="button" className="ss-btn-outline" onClick={handleDownloadCsv} disabled={!codes.length}>
                Download CSV
              </button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active codes</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--navy)]">{activeCount}</p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Redeemed codes</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--navy)]">{redeemedCount}</p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Code inventory</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--navy)]">{codes.length}</p>
            </div>
            {loadError ? (
              <div className="md:col-span-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                {loadError}
              </div>
            ) : null}
            {!codes.length ? (
              <div className="md:col-span-3 rounded-2xl border bg-white p-6">
                <p className="font-medium text-[var(--navy)]">No access codes yet</p>
                <p className="mt-2 text-sm text-muted-foreground">Create a batch of access codes to start employer redemptions.</p>
                <Link href="/employers/codes" className="ss-btn mt-4 inline-flex">
                  Create codes
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
