'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Timestamp, collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { useRequireRole } from '@/lib/auth/requireRole';
import { useToast } from '@/hooks/use-toast';

type AccessCodeRow = {
  id: string;
  status: 'active' | 'redeemed' | 'revoked' | 'expired';
  code: string;
};

type AccessCodeBatch = {
  id: string;
  employerId: string;
  filename: string;
  quantity: number;
  codes: string[];
  createdAt?: string | null;
  expiresAt?: string | null;
};

type EmployerProfile = {
  companyEmail?: string;
  locations?: Array<{ state?: string; city?: string }>;
};

function formatTimestamp(value?: Timestamp | null) {
  return typeof value?.toDate === 'function' ? value.toDate().toLocaleString() : 'No expiration';
}

function formatBatchTimestamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'No expiration';
}

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function EmployerDashboardPage() {
  const guard = useRequireRole('employer');
  const { user } = useAuth();
  const { toast } = useToast();
  const [codes, setCodes] = useState<AccessCodeRow[]>([]);
  const [batches, setBatches] = useState<AccessCodeBatch[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [employerProfile, setEmployerProfile] = useState<EmployerProfile | null>(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');

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

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    void (async () => {
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/access-codes/batches', {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        const payload = (await response.json().catch(() => null)) as
          | { batches?: AccessCodeBatch[]; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || 'Could not load code batches.');
        }

        if (!cancelled) {
          setBatches(Array.isArray(payload?.batches) ? payload.batches : []);
        }
      } catch (error) {
        console.warn('Code batch history is unavailable for this employer session:', error);
        if (!cancelled) setBatches([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'employers', user.uid));
        setEmployerProfile(snap.exists() ? (snap.data() as EmployerProfile) : null);
      } catch (error) {
        console.error('Error loading employer profile:', error);
      }
    })();
  }, [user]);

  const activeCount = useMemo(() => codes.filter((row) => row.status === 'active').length, [codes]);
  const redeemedCount = useMemo(() => codes.filter((row) => row.status === 'redeemed').length, [codes]);
  const availableYears = useMemo(() => {
    return Array.from(
      new Set(
        batches
          .map((batch) => (batch.createdAt ? new Date(batch.createdAt).getFullYear() : null))
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      )
    ).sort((a, b) => b - a);
  }, [batches]);
  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      if (!batch.createdAt) return !filterMonth && !filterYear;

      const createdAt = new Date(batch.createdAt);
      const matchesMonth = filterMonth ? createdAt.getMonth() + 1 === Number(filterMonth) : true;
      const matchesYear = filterYear ? createdAt.getFullYear() === Number(filterYear) : true;

      return matchesMonth && matchesYear;
    });
  }, [batches, filterMonth, filterYear]);

  const handleCopyCodes = async () => {
    const visibleCodes = codes.map((row) => row.code).join('\n');
    if (!visibleCodes) return;
    try {
      await navigator.clipboard.writeText(visibleCodes);
      toast({
        title: 'Codes copied',
        description: 'The current code inventory was copied to your clipboard.',
      });
    } catch (error) {
      console.error('Could not copy codes:', error);
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'The codes could not be copied right now.',
      });
    }
  };

  const handleDownloadCsv = () => {
    if (!codes.length) return;
    downloadCsv(
      [
        ['Code', 'Status'],
        ...codes.map((row) => [row.code, row.status]),
      ],
      'shiftsitter-access-codes.csv'
    );
  };

  const handleDownloadBatch = (batch: AccessCodeBatch) => {
    downloadCsv(
      [
        ['Code', 'Created On', 'Expires On'],
        ...(batch.codes || []).map((code) => [
          code,
          formatBatchTimestamp(batch.createdAt),
          formatBatchTimestamp(batch.expiresAt),
        ]),
      ],
      batch.filename || `shiftsitter-codes-${batch.id}.csv`
    );
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
        <div className="grid gap-5">
          <Card className="ss-soft-card">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="font-headline">Employer Dashboard</CardTitle>
                <CardDescription>Track access codes, redemption activity, and your company setup.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/employers/codes" className="ss-btn text-center">
                  Open Codes
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
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Company address</p>
                <p className="mt-2 text-base font-medium text-[var(--navy)]">
                  {employerProfile?.locations?.[0]
                    ? [employerProfile.locations[0]?.city, employerProfile.locations[0]?.state].filter(Boolean).join(', ')
                    : 'Not added yet'}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Contact email</p>
                <p className="mt-2 text-base font-medium text-[var(--navy)]">{employerProfile?.companyEmail || user?.email || 'Not added yet'}</p>
              </div>
              {loadError ? (
                <div className="md:col-span-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                  {loadError}
                </div>
              ) : null}
              {!codes.length ? (
                <div className="md:col-span-3 rounded-2xl border bg-white p-6">
                  <p className="font-medium text-[var(--navy)]">No access codes yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">Open the Codes page to create your first batch and start employer redemptions.</p>
                  <Link href="/employers/codes" className="ss-btn mt-4 inline-flex">
                    Open Codes
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="ss-soft-card">
            <CardHeader>
              <CardTitle className="font-headline">Code Files</CardTitle>
              <CardDescription>Each generated batch is saved here with its download file, creation date, and expiration date.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Month</label>
                  <select
                    value={filterMonth}
                    onChange={(event) => setFilterMonth(event.target.value)}
                    className="ss-input border border-emerald-300/80 bg-white shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/10"
                  >
                    <option value="">All months</option>
                    <option value="1">January</option>
                    <option value="2">February</option>
                    <option value="3">March</option>
                    <option value="4">April</option>
                    <option value="5">May</option>
                    <option value="6">June</option>
                    <option value="7">July</option>
                    <option value="8">August</option>
                    <option value="9">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Year</label>
                  <select
                    value={filterYear}
                    onChange={(event) => setFilterYear(event.target.value)}
                    className="ss-input border border-emerald-300/80 bg-white shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/10"
                  >
                    <option value="">All years</option>
                    {availableYears.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="ss-btn-outline w-full"
                    onClick={() => {
                      setFilterMonth('');
                      setFilterYear('');
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
              {batches.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">
                  Your generated code files will appear here once a new batch is created.
                </div>
              ) : filteredBatches.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">
                  No code files match the selected month and year filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-3 py-3 font-medium">File</th>
                        <th className="px-3 py-3 font-medium">Codes</th>
                        <th className="px-3 py-3 font-medium">Created On</th>
                        <th className="px-3 py-3 font-medium">Expires On</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-3 py-3 font-medium">Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatches.map((batch) => {
                        const isExpired =
                          Boolean(batch.expiresAt) && new Date(batch.expiresAt as string).getTime() <= Date.now();
                        return (
                          <tr key={batch.id} className="border-b last:border-0">
                            <td className="px-3 py-3 font-medium text-[var(--navy)]">{batch.filename}</td>
                            <td className="px-3 py-3">{batch.quantity || batch.codes?.length || 0}</td>
                            <td className="px-3 py-3">{formatBatchTimestamp(batch.createdAt)}</td>
                            <td className="px-3 py-3">{formatBatchTimestamp(batch.expiresAt)}</td>
                            <td className="px-3 py-3">{isExpired ? 'Expired' : 'Available'}</td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={() => handleDownloadBatch(batch)}
                              >
                                Download CSV
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
