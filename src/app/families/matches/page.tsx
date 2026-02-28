'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { Conversation, UserProfile } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type MatchRow = {
  id: string;
  otherUser: UserProfile | null;
  conversation: {
    id: string;
    lastMessage: string;
    lastMessageAt: number | null;
  } | null;
};

export default function MyMatchesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;

    void (async () => {
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/matches/list', {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          const err = await response.text().catch(() => '');
          throw new Error(err || 'Could not load matches.');
        }

        const payload = (await response.json()) as { rows?: MatchRow[] };
        if (!active) return;
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
      } catch (error) {
        console.error('Error loading active matches:', error);
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user]);

  const handleOpenChat = async (row: MatchRow) => {
    if (!user || !row.otherUser || busyRowId) return;

    setBusyRowId(row.id);
    try {
      let conversationId = row.conversation?.id;

      if (!conversationId) {
        const conversationRef = doc(db, 'conversations', row.id);
        await setDoc(
          conversationRef,
          {
            userIds: [user.uid, row.otherUser.id],
            createdAt: serverTimestamp(),
            lastMessage: '',
            lastMessageAt: serverTimestamp(),
            lastMessageSenderId: '',
            userProfiles: {
              [user.uid]: {
                name: user.displayName || 'You',
                photoURLs: [],
              },
              [row.otherUser.id]: {
                name: row.otherUser.name,
                photoURLs: row.otherUser.photoURLs || [],
              },
            },
          },
          { merge: true }
        );
        conversationId = conversationRef.id;
      }

      router.push(`/families/messages/${conversationId}`);
    } catch (error) {
      console.error('Could not reopen chat:', error);
    } finally {
      setBusyRowId(null);
    }
  };

  const handleEndMatch = async (row: MatchRow) => {
    if (!user || !row.otherUser || busyRowId) return;

    const confirmed = window.confirm(`End your match with ${row.otherUser.name}?`);
    if (!confirmed) return;

    setBusyRowId(row.id);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/matches/unmatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          conversationId: row.conversation?.id,
          otherUserId: row.otherUser.id,
        }),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(err || 'Could not end this match.');
      }

      setRows((currentRows) => currentRows.filter((currentRow) => currentRow.id !== row.id));
    } catch (error) {
      console.error('End match failed:', error);
    } finally {
      setBusyRowId(null);
    }
  };

  if (loading || authLoading) {
    return (
      <AuthGuard>
        <div className="ss-page-shell">
          <div className="ss-page-inner">
            <Card className="ss-soft-card">
              <CardHeader>
                <CardTitle className="font-headline">My Matches</CardTitle>
                <CardDescription>Loading your active matches...</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-12">
                <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="ss-page-shell">
        <div className="ss-page-inner">
          <Card className="ss-soft-card">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="font-headline">My Matches</CardTitle>
                <CardDescription>Active matches you can reopen, review, or end.</CardDescription>
              </div>
              <Link href="/families/messages" className="inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
                Back to Messages
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              {rows.length === 0 ? (
                <div className="rounded-2xl border bg-white p-8 text-center text-muted-foreground">
                  You do not have active matches right now.
                </div>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-14 w-14">
                          <AvatarImage src={row.otherUser?.photoURLs?.[0]} />
                          <AvatarFallback>{(row.otherUser?.name || 'U').charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-lg font-semibold text-[var(--navy)]">{row.otherUser?.name}</p>
                          <p className="text-sm text-muted-foreground">{row.otherUser?.location || 'Location unavailable'}</p>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {row.conversation ? 'Chat ready' : 'Match active'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-none hover:opacity-95"
                          onClick={() => handleOpenChat(row)}
                          disabled={busyRowId === row.id}
                        >
                          {busyRowId === row.id ? 'Opening...' : 'Chat'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="rounded-full px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-700"
                          onClick={() => router.push(`/families/profile/${row.otherUser?.id}`)}
                        >
                          View Profile
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="rounded-full px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-700"
                          onClick={() => router.push('/families/calendar')}
                        >
                          View Shifts
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="rounded-full px-3 py-2 text-sm font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => handleEndMatch(row)}
                          disabled={busyRowId === row.id}
                        >
                          End Match
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  );
}
