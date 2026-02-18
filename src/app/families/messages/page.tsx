'use client';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Conversation } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Timestamp } from 'firebase/firestore';
import { AuthGuard } from '@/components/AuthGuard';

export default function MessagesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    const q = query(
      collection(db, 'conversations'),
      where('userIds', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const convs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
      setConversations(convs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const getOtherUser = (conv: Conversation) => {
    if (!user) return null;
    const otherUserId = conv.userIds.find(id => id !== user.uid);
    return otherUserId ? conv.userProfiles[otherUserId] : null;
  }
  
  if (loading || authLoading) {
      return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Messages</CardTitle>
                    <CardDescription>Loading your conversations...</CardDescription>
                </CardHeader>
                <CardContent className="text-center py-12">
                    <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </CardContent>
            </Card>
        </div>
      );
  }

  return (
    <AuthGuard>
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Messages</CardTitle>
            <CardDescription>Here are your recent conversations.</CardDescription>
          </CardHeader>
          <CardContent>
            {conversations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">You have no messages yet.</p>
                <p className="text-muted-foreground mt-1">Start matching to begin conversations!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {conversations.map(conv => {
                  const otherUser = getOtherUser(conv);
                  if (!otherUser) return null;
                  return (
                    <div
                      key={conv.id}
                      className="flex items-center p-3 -mx-3 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                      onClick={() => router.push(`/families/messages/${conv.id}`)}
                    >
                      <Avatar className="h-12 w-12 mr-4">
                        <AvatarImage src={otherUser.photoURLs[0]} alt={otherUser.name} />
                        <AvatarFallback>{otherUser.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between">
                          <p className="font-semibold">{otherUser.name}</p>
                          {conv.lastMessageAt && (
                            <p className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                              {formatDistanceToNow((conv.lastMessageAt as Timestamp).toDate(), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.lastMessageSenderId === user?.uid ? 'You: ' : ''}{conv.lastMessage || 'No messages yet.'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
