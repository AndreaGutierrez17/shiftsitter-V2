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
  verificationReviewNotes?: string;
};

export default function AdminVerificationPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

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
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading queue...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No verification submissions yet.</p>
            ) : (
              <div className="space-y-4">
                {items.map((row) => (
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
                    <div className="mt-3">
                      <Textarea
                        value={notes[row.id] || ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        placeholder="Admin notes (optional)"
                        maxLength={280}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => updateStatus(row, 'verified')} disabled={savingId === row.id}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateStatus(row, 'rejected')} disabled={savingId === row.id}>Reject</Button>
                      <Button size="sm" variant="secondary" onClick={() => updateStatus(row, 'pending')} disabled={savingId === row.id}>Mark Pending</Button>
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

