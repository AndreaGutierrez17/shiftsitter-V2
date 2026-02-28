'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type VerificationRow = {
  id: string;
  name: string;
  email: string | null;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  idFrontUrl: string | null;
  selfieUrl: string | null;
  verificationSubmittedAt?: unknown;
  verificationReviewedAt?: unknown;
  verificationReviewNotes?: string;
};

function formatTimestamp(value: unknown) {
  if (!value) return 'Not available';
  if (typeof value === 'object' && value !== null && 'seconds' in (value as Record<string, unknown>)) {
    const seconds = (value as { seconds?: number }).seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000).toLocaleString();
  }
  if (typeof value === 'object' && value !== null && '_seconds' in (value as Record<string, unknown>)) {
    const seconds = (value as { _seconds?: number })._seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000).toLocaleString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  return 'Not available';
}

export default function AdminVerificationPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | VerificationRow['verificationStatus']>('all');

  const loadQueue = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/verification', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not load queue');
      setItems(data.items || []);
      const nextNotes: Record<string, string> = {};
      (data.items || []).forEach((row: VerificationRow) => {
        nextNotes[row.id] = row.verificationReviewNotes || '';
      });
      setNotes(nextNotes);
    } catch (e: any) {
      setError(e?.message || 'Could not load verification queue');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((row) => filter === 'all' || row.verificationStatus === filter);

  useEffect(() => {
    loadQueue();
  }, [user]);

  const updateStatus = async (row: VerificationRow, verificationStatus: VerificationRow['verificationStatus']) => {
    if (!user) return;
    setSavingId(row.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/verification', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: row.id,
          verificationStatus,
          verificationReviewNotes: notes[row.id] || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not update');
      await loadQueue();
    } catch (e: any) {
      setError(e?.message || 'Could not update verification');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AuthGuard>
      <div className="container mx-auto max-w-6xl p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Verification Review (Admin)</CardTitle>
            <CardDescription>Review uploaded ID front + selfie and update verification status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>All</Button>
              <Button size="sm" variant={filter === 'pending' ? 'default' : 'outline'} onClick={() => setFilter('pending')}>Pending</Button>
              <Button size="sm" variant={filter === 'rejected' ? 'default' : 'outline'} onClick={() => setFilter('rejected')}>Rejected</Button>
              <Button size="sm" variant={filter === 'verified' ? 'default' : 'outline'} onClick={() => setFilter('verified')}>Verified</Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading queue...</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No verification submissions match this filter.</p>
            ) : (
              <div className="space-y-4">
                {filteredItems.map((row) => (
                  <div key={row.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-sm text-muted-foreground">{row.email || row.id}</p>
                      </div>
                      <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium">
                        {row.verificationStatus}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-2">ID Front</p>
                        {row.idFrontUrl ? <a className="text-primary underline" href={row.idFrontUrl} target="_blank" rel="noreferrer">Open ID file</a> : <span className="text-sm text-muted-foreground">Missing</span>}
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-2">Selfie</p>
                        {row.selfieUrl ? <a className="text-primary underline" href={row.selfieUrl} target="_blank" rel="noreferrer">Open selfie file</a> : <span className="text-sm text-muted-foreground">Missing</span>}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="rounded-lg border p-3">
                        <p className="font-medium text-foreground">Submitted</p>
                        <p className="mt-1">{formatTimestamp(row.verificationSubmittedAt)}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="font-medium text-foreground">Reviewed</p>
                        <p className="mt-1">{formatTimestamp(row.verificationReviewedAt)}</p>
                      </div>
                    </div>
                    {row.verificationReviewNotes ? (
                      <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm">
                        <p className="font-medium">Current note</p>
                        <p className="mt-1 text-muted-foreground">{row.verificationReviewNotes}</p>
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <Textarea
                        value={notes[row.id] || ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        placeholder="Admin notes (optional)"
                        maxLength={280}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => updateStatus(row, 'verified')} disabled={savingId === row.id}>Approve (Verified)</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateStatus(row, 'rejected')} disabled={savingId === row.id}>Reject</Button>
                      <Button size="sm" variant="secondary" onClick={() => updateStatus(row, 'pending')} disabled={savingId === row.id}>Reset to Pending</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
