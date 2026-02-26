'use client';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Conversation } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Timestamp } from 'firebase/firestore';
import { AuthGuard } from '@/components/AuthGuard';

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <AuthGuard>
      <div className="ss-page-shell">
        <div className="messages-shell-wrap">
          <Card className="messages-panel">
            <CardHeader className="messages-head-block">
              <CardTitle className="font-headline messages-title">Messages</CardTitle>
              <CardDescription className="messages-subtitle">Here are your recent conversations.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 messages-scroll-area">
              {loadError && (
                <div className="text-center py-4">
                  <p className="text-sm text-destructive">{loadError}</p>
                </div>
              )}
              {conversations.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">You have no messages yet.</p>
                  <p className="text-muted-foreground mt-1">Start matching to begin conversations!</p>
                </div>
              ) : (
                <div className="messages-list">
                  {conversations.map(conv => {
                    const otherUser = getOtherUser(conv);
                    if (!otherUser) return null;
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
                            {conv.lastMessageAt ? (
                              <p className="messages-time">
                                {typeof (conv.lastMessageAt as Timestamp)?.toDate === 'function'
                                  ? formatDistanceToNow((conv.lastMessageAt as Timestamp).toDate(), { addSuffix: true })
                                  : ''}
                              </p>
                            ) : null}
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

