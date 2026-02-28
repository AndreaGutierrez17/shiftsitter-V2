'use client';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Conversation, UserProfile } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Timestamp } from 'firebase/firestore';
import { AuthGuard } from '@/components/AuthGuard';

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null | undefined>(undefined);
  const [messageUnreadCounts, setMessageUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      setCurrentUserProfile(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as UserProfile) : null);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setMessageUnreadCounts({});
      return;
    }

    const unreadQuery = query(
      collection(db, 'notifications', user.uid, 'items'),
      where('type', '==', 'message'),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(unreadQuery, (snapshot) => {
      const nextCounts: Record<string, number> = {};
      snapshot.docs.forEach((row) => {
        const data = row.data() as { data?: { conversationId?: unknown } };
        const conversationId = typeof data.data?.conversationId === 'string' ? data.data.conversationId : '';
        if (!conversationId) return;
        nextCounts[conversationId] = (nextCounts[conversationId] || 0) + 1;
      });
      setMessageUnreadCounts(nextCounts);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (!authLoading) setLoading(false);
      return;
    }
    
    setLoading(true);
    setLoadError(null);
    const q = query(
      collection(db, 'conversations'),
      where('userIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const convs = querySnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Conversation))
          .sort((a, b) => {
            const aTime = typeof (a.lastMessageAt as Timestamp)?.toMillis === 'function'
              ? (a.lastMessageAt as Timestamp).toMillis()
              : 0;
            const bTime = typeof (b.lastMessageAt as Timestamp)?.toMillis === 'function'
              ? (b.lastMessageAt as Timestamp).toMillis()
              : 0;
            return bTime - aTime;
          });
        setConversations(convs);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading conversations:', error);
        setLoadError('Could not load conversations. Check Firestore permissions/indexes.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, authLoading]);

  const getOtherUser = (conv: Conversation) => {
    if (!user) return null;
    if (!Array.isArray(conv.userIds) || !conv.userProfiles) return null;
    const otherUserId = conv.userIds.find(id => id !== user.uid);
    return otherUserId ? conv.userProfiles?.[otherUserId] ?? null : null;
  }

  const canAccessSecureMessaging = Boolean(
    currentUserProfile &&
    (
      currentUserProfile.isDemo ||
      currentUserProfile.verificationStatus === 'verified' ||
      (currentUserProfile.idFrontUrl && currentUserProfile.selfieUrl)
    )
  );
  
  if (loading || authLoading) {
      return (
        <div className="ss-page-shell">
          <div className="ss-page-inner">
            <Card className="ss-soft-card">
                <CardHeader>
                    <CardTitle className="font-headline">Messages</CardTitle>
                    <CardDescription>Loading your conversations...</CardDescription>
                </CardHeader>
                <CardContent className="text-center py-12">
                    <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </CardContent>
            </Card>
          </div>
        </div>
      );
  }
  if (user && typeof currentUserProfile === 'undefined') {
    return (
      <div className="ss-page-shell">
        <div className="ss-page-inner">
          <Card className="ss-soft-card">
            <CardContent className="text-center py-12">
              <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="ss-page-shell">
        <div className="messages-shell-wrap">
          <Card className="messages-panel">
            <CardHeader className="messages-head-block">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="font-headline messages-title">Messages</CardTitle>
                  <CardDescription className="messages-subtitle">
                    {canAccessSecureMessaging ? 'Here are your recent conversations.' : 'Upload your documents before opening secure conversations.'}
                  </CardDescription>
                </div>
                <Link
                  href="/families/matches"
                  className="inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  View My Matches
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0 messages-scroll-area">
              {loadError && (
                <div className="text-center py-4">
                  <p className="text-sm text-destructive">{loadError}</p>
                </div>
              )}
              {!canAccessSecureMessaging ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">To unlock messages, upload your ID front and selfie first.</p>
                  <p className="text-muted-foreground mt-1">Verification activates automatically as soon as both files are uploaded.</p>
                  <Link href="/families/profile/edit" className="inline-flex mt-4 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
                    Go to Profile Edit
                  </Link>
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">You have no messages yet.</p>
                  <p className="text-muted-foreground mt-1">Start matching to begin conversations!</p>
                </div>
              ) : (
                <div className="messages-list">
                  {conversations.map(conv => {
                    const otherUser = getOtherUser(conv);
                    if (!otherUser) return null;
                    const unreadForMe = Math.max(
                      0,
                      Number(messageUnreadCounts[conv.id] || conv.unreadCount?.[user?.uid || ''] || 0)
                    );
                    return (
                      <Link
                        key={conv.id}
                        href={`/families/messages/${conv.id}`}
                        className="messages-item"
                      >
                        <Avatar className="messages-avatar">
                          <AvatarImage src={otherUser.photoURLs?.[0]} alt={otherUser.name || 'User'} />
                          <AvatarFallback>{(otherUser.name || 'U').charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="messages-main">
                          <div className="messages-head">
                            <p className="messages-name">{otherUser.name || 'Unknown user'}</p>
                            <div className="flex items-center gap-2">
                              {unreadForMe > 0 ? (
                                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-5 text-white">
                                  {unreadForMe > 9 ? '9+' : unreadForMe}
                                </span>
                              ) : null}
                              {conv.lastMessageAt ? (
                                <p className="messages-time">
                                  {typeof (conv.lastMessageAt as Timestamp)?.toDate === 'function'
                                    ? formatDistanceToNow((conv.lastMessageAt as Timestamp).toDate(), { addSuffix: true })
                                    : ''}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <p className="messages-preview">
                            {conv.lastMessageSenderId === user?.uid ? 'You: ' : ''}{conv.lastMessage || 'No messages yet.'}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  );
}

