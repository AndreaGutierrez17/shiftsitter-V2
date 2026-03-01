'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { UserProfile } from '@/lib/types';
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

type PendingRequestRow = {
  id: string;
  fromUid: string;
  otherUser: {
    id: string;
    name: string;
    location: string;
    photoURLs: string[];
  };
};

type SentRequestRow = {
  id: string;
  toUid: string;
  otherUser: {
    id: string;
    name: string;
    location: string;
    photoURLs: string[];
  };
};

function minimalProfile(uid: string, publicProfile?: Record<string, unknown>, legacyUser?: Record<string, unknown>) {
  const photoURLs = Array.isArray(publicProfile?.photoURLs)
    ? publicProfile.photoURLs.map((value) => String(value))
    : Array.isArray(legacyUser?.photoURLs)
      ? legacyUser.photoURLs.map((value) => String(value))
      : [];

  const primary = typeof publicProfile?.photoURL === 'string' ? publicProfile.photoURL : photoURLs[0];
  const fullPhotos = primary ? [primary, ...photoURLs.filter((url) => url !== primary)] : photoURLs;
  const city = typeof publicProfile?.city === 'string' ? publicProfile.city : typeof legacyUser?.city === 'string' ? legacyUser.city : '';
  const state = typeof publicProfile?.state === 'string' ? publicProfile.state : typeof legacyUser?.state === 'string' ? legacyUser.state : '';
  const zip = typeof publicProfile?.homeZip === 'string' ? publicProfile.homeZip : typeof legacyUser?.zip === 'string' ? legacyUser.zip : '';
  const location =
    (city && state && zip && `${city}, ${state} ${zip}`) ||
    (city && state && `${city}, ${state}`) ||
    (typeof publicProfile?.location === 'string' ? publicProfile.location : typeof legacyUser?.location === 'string' ? legacyUser.location : '');

  return {
    id: uid,
    name:
      (typeof publicProfile?.displayName === 'string' && publicProfile.displayName) ||
      (typeof legacyUser?.name === 'string' && legacyUser.name) ||
      'Family',
    location,
    photoURLs: fullPhotos,
  };
}

export default function MyMatchesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestRow[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setRows([]);
      setPendingRequests([]);
      setSentRequests([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

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

    const requestsQuery = query(collection(db, 'match_requests'), where('toUid', '==', user.uid));
    const sentRequestsQuery = query(collection(db, 'match_requests'), where('fromUid', '==', user.uid));

    const unsubscribeIncoming = onSnapshot(
      requestsQuery,
      async (snapshot) => {
        try {
          const pendingDocs = snapshot.docs
            .filter((row) => row.data().status === 'pending')
            .filter((row) => Boolean((row.data() as { fromUid?: string }).fromUid));
          const requesters = await Promise.all(
            pendingDocs.map(async (row) => {
              const data = row.data() as { fromUid?: string };
              const fromUid = String(data.fromUid);
              const legacySnap = await getDoc(doc(db, 'users', fromUid));

              return {
                id: row.id,
                fromUid,
                otherUser: minimalProfile(
                  fromUid,
                  undefined,
                  legacySnap.exists() ? (legacySnap.data() as Record<string, unknown>) : undefined
                ),
              } satisfies PendingRequestRow;
            })
          );

          if (!active) return;
          setPendingRequests(requesters);
        } catch (error) {
          console.error('Error loading incoming match requests:', error);
          if (active) setPendingRequests([]);
        }
      },
      (error) => {
        console.error('match_requests listener failed:', error);
        if (active) setPendingRequests([]);
      }
    );

    const unsubscribeOutgoing = onSnapshot(
      sentRequestsQuery,
      async (snapshot) => {
        try {
          const pendingDocs = snapshot.docs
            .filter((row) => row.data().status === 'pending')
            .filter((row) => Boolean((row.data() as { toUid?: string }).toUid));

          const requesters = await Promise.all(
            pendingDocs.map(async (row) => {
              const data = row.data() as { toUid?: string };
              const toUid = String(data.toUid);
              const legacySnap = await getDoc(doc(db, 'users', toUid));

              return {
                id: row.id,
                toUid,
                otherUser: minimalProfile(
                  toUid,
                  undefined,
                  legacySnap.exists() ? (legacySnap.data() as Record<string, unknown>) : undefined
                ),
              } satisfies SentRequestRow;
            })
          );

          if (!active) return;
          setSentRequests(requesters);
        } catch (error) {
          console.error('Error loading outgoing match requests:', error);
          if (active) setSentRequests([]);
        }
      },
      (error) => {
        console.error('outgoing match_requests listener failed:', error);
        if (active) setSentRequests([]);
      }
    );

    return () => {
      active = false;
      unsubscribeIncoming();
      unsubscribeOutgoing();
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

  const handleAcceptRequest = async (requestRow: PendingRequestRow) => {
    if (!user || busyRowId) return;

    setBusyRowId(requestRow.id);
    try {
      const [meSnap, otherSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDoc(doc(db, 'users', requestRow.fromUid)),
      ]);

      const meData = meSnap.exists() ? (meSnap.data() as Record<string, unknown>) : {};
      const otherData = otherSnap.exists() ? (otherSnap.data() as Record<string, unknown>) : {};
      const userIds = [user.uid, requestRow.fromUid].sort();
      const matchId = `${userIds[0]}_${userIds[1]}`;

      const batch = writeBatch(db);
      batch.update(doc(db, 'match_requests', requestRow.id), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'matches', matchId),
        {
          uids: userIds,
          userIds,
          uid1: userIds[0],
          uid2: userIds[1],
          createdAt: serverTimestamp(),
          lastMessageAt: null,
          status: 'confirmed',
        },
        { merge: true }
      );
      batch.set(
        doc(db, 'conversations', matchId),
        {
          userIds: [user.uid, requestRow.fromUid],
          createdAt: serverTimestamp(),
          lastMessage: '',
          lastMessageAt: serverTimestamp(),
          lastMessageSenderId: '',
          userProfiles: {
            [user.uid]: {
              name: (typeof meData.name === 'string' && meData.name) || user.displayName || 'You',
              photoURLs: Array.isArray(meData.photoURLs) ? meData.photoURLs : [],
            },
            [requestRow.fromUid]: {
              name: (typeof otherData.name === 'string' && otherData.name) || requestRow.otherUser.name,
              photoURLs: Array.isArray(otherData.photoURLs) ? otherData.photoURLs : requestRow.otherUser.photoURLs,
            },
          },
        },
        { merge: true }
      );
      await batch.commit();

      try {
        const idToken = await user.getIdToken();
        await fetch('/api/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            type: 'match',
            notificationId: `match_accepted_${matchId}_${requestRow.fromUid}`,
            targetUserIds: [requestRow.fromUid],
            title: 'Match Accepted',
            body: `${requestRow.otherUser.name} accepted your match request.`,
            link: `/families/messages/${matchId}`,
            data: {
              matchId,
              otherUserUid: user.uid,
            },
          }),
        });
      } catch (notifyError) {
        console.error('Could not send match accepted notification:', notifyError);
      }

      setPendingRequests((current) => current.filter((row) => row.id !== requestRow.id));
      setRows((current) => [
        {
          id: matchId,
          otherUser: {
            id: requestRow.otherUser.id,
            name: requestRow.otherUser.name,
            location: requestRow.otherUser.location,
            photoURLs: requestRow.otherUser.photoURLs,
          } as UserProfile,
          conversation: {
            id: matchId,
            lastMessage: '',
            lastMessageAt: null,
          },
        },
        ...current,
      ]);
    } catch (error) {
      console.error('Could not accept match request:', error);
    } finally {
      setBusyRowId(null);
    }
  };

  const handleDeclineRequest = async (requestRow: PendingRequestRow) => {
    if (!user || busyRowId) return;

    setBusyRowId(requestRow.id);
    try {
      await updateDoc(doc(db, 'match_requests', requestRow.id), {
        status: 'declined',
        updatedAt: serverTimestamp(),
      });

      try {
        const idToken = await user.getIdToken();
        await fetch('/api/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            type: 'request',
            notificationId: `match_declined_${requestRow.id}_${requestRow.fromUid}`,
            targetUserIds: [requestRow.fromUid],
            title: 'Match Request Declined',
            body: `${requestRow.otherUser.name} declined your match request.`,
            link: '/families/matches',
            data: {
              requestId: requestRow.id,
              status: 'declined',
            },
          }),
        });
      } catch (notifyError) {
        console.error('Could not send match declined notification:', notifyError);
      }

      setPendingRequests((current) => current.filter((row) => row.id !== requestRow.id));
    } catch (error) {
      console.error('Could not decline match request:', error);
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
                <CardDescription>Incoming requests must be accepted before chat is unlocked.</CardDescription>
              </div>
              <Link href="/families/messages" className="inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
                Back to Messages
              </Link>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sent Requests</h3>
                <div className="mt-3 space-y-4">
                  {sentRequests.length === 0 ? (
                    <div className="rounded-2xl border bg-white p-6 text-center text-muted-foreground">
                      You do not have pending sent requests right now.
                    </div>
                  ) : (
                    sentRequests.map((requestRow) => (
                      <div key={requestRow.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-14 w-14">
                              <AvatarImage src={requestRow.otherUser.photoURLs?.[0]} />
                              <AvatarFallback>{(requestRow.otherUser.name || 'F').charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-lg font-semibold text-[var(--navy)]">{requestRow.otherUser.name}</p>
                              <p className="text-sm text-muted-foreground">{requestRow.otherUser.location || 'Location unavailable'}</p>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Awaiting their response</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="rounded-full px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-700"
                              onClick={() => router.push(`/families/profile/${requestRow.otherUser.id}`)}
                            >
                              View Profile
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pending Requests</h3>
                <div className="mt-3 space-y-4">
                  {pendingRequests.length === 0 ? (
                    <div className="rounded-2xl border bg-white p-6 text-center text-muted-foreground">
                      You do not have pending requests right now.
                    </div>
                  ) : (
                    pendingRequests.map((requestRow) => (
                      <div key={requestRow.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-14 w-14">
                              <AvatarImage src={requestRow.otherUser?.photoURLs?.[0]} />
                              <AvatarFallback>{(requestRow.otherUser?.name || 'F').charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-lg font-semibold text-[var(--navy)]">{requestRow.otherUser?.name}</p>
                              <p className="text-sm text-muted-foreground">{requestRow.otherUser?.location || 'Location unavailable'}</p>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Waiting for your response</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-none hover:opacity-95"
                              onClick={() => handleAcceptRequest(requestRow)}
                              disabled={busyRowId === requestRow.id}
                            >
                              {busyRowId === requestRow.id ? 'Working...' : 'Accept'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="rounded-full px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-700"
                              onClick={() => router.push(`/families/profile/${requestRow.otherUser?.id}`)}
                            >
                              View Profile
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="rounded-full px-3 py-2 text-sm font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                              onClick={() => handleDeclineRequest(requestRow)}
                              disabled={busyRowId === requestRow.id}
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Active Matches</h3>
                <div className="mt-3 space-y-4">
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
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  );
}
