'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Conversation, Message, UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { db } from '@/lib/firebase/client';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { AuthGuard } from '@/components/AuthGuard';

type FirestoreError = { message?: string };
type AiIcebreakerSuggestionOutput = {
  icebreakerMessages: string[];
  tips: string[];
};
const MAX_MESSAGE_LENGTH = 500;

const localIcebreakerFallback = (name: string): AiIcebreakerSuggestionOutput => ({
  icebreakerMessages: [
    `Hi ${name}! Great to connect here. Want to share availability for this week?`,
    `Would you like to start with a quick intro about routines and preferred times?`,
    `I can share my schedule first so we can find a good overlap.`,
  ],
  tips: [
    'Keep your first message short and friendly.',
    'Propose one specific time option to keep momentum.',
    'Confirm key expectations early: timing, location, and communication.',
  ],
});

export default function ChatPage() {
  const rawParams = useParams();
  const params = rawParams as Record<string, string | string[] | undefined>;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiIcebreakerSuggestionOutput | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversationId =
    (typeof params.id === 'string' ? params.id : '') ||
    (typeof params.Id === 'string' ? params.Id : '');

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/families/messages');
  };

  useEffect(() => {
    if (!user || !conversationId) return;

    // Fetch conversation details
    const convDocRef = doc(db, 'conversations', conversationId);
    const unsubConv = onSnapshot(
      convDocRef,
      (convDoc) => {
        if (convDoc.exists()) {
          setConversation({ id: convDoc.id, ...(convDoc.data() as Omit<Conversation, 'id'>) });
        } else {
          setConversation(null);
        }
        setLoadError(null);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading conversation:', error);
        setLoadError('Could not load this conversation. Check Firestore permissions.');
        setLoading(false);
      }
    );

    // Fetch messages
    const messagesQuery = query(collection(db, 'conversations', conversationId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubMessages = onSnapshot(
      messagesQuery,
      (querySnapshot) => {
        const msgs = querySnapshot.docs.map(messageDoc => ({ id: messageDoc.id, ...messageDoc.data() } as Message));
        setMessages(msgs);
      },
      (error) => {
        console.error('Error loading messages:', error);
        setLoadError('Could not load messages for this conversation.');
      }
    );

    return () => {
      unsubConv();
      unsubMessages();
    };
  }, [user, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = newMessage.trim();
    if (!user || trimmedMessage === '' || trimmedMessage.length > MAX_MESSAGE_LENGTH) return;

    const msgText = trimmedMessage;
    setNewMessage('');
    
    await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
      conversationId: conversationId,
      senderId: user.uid,
      text: msgText,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: msgText,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
    });

    try {
      const idToken = await user.getIdToken();
      await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          type: 'message',
          conversationId,
          title: 'New message',
          body: msgText.length > 80 ? `${msgText.slice(0, 77)}...` : msgText,
          link: `/families/messages/${conversationId}`,
        }),
      });
    } catch (error: unknown) {
      const notifyError = error as FirestoreError;
      console.error('Notification add-on failed:', notifyError.message ?? error);
    }
  };
  
  const handleGetIcebreakers = async () => {
    if (!user || !conversation) return;
    setIsLoadingAi(true);
    try {
        let fallbackName = 'there';
        const otherUserId = conversation.userIds.find((id: string) => id !== user.uid);
        if (!otherUserId) {
          throw new Error("Could not resolve the matched user for this conversation.");
        }
        
        const currentUserProfileDoc = await getDoc(doc(db, 'users', user.uid));
        const matchedUserProfileDoc = await getDoc(doc(db, 'users', otherUserId));

        if (!currentUserProfileDoc.exists() || !matchedUserProfileDoc.exists()) {
            throw new Error("Could not fetch user profiles");
        }
        const matchedProfileData = matchedUserProfileDoc.data() as UserProfile;
        fallbackName = matchedProfileData.name || fallbackName;

        const toAiProfile = (
          profile: UserProfile
        ) => ({
          id: profile.id,
          name: profile.name,
          location: profile.location,
          childAge: profile.childAge,
          availability: profile.availability || '',
          needs: profile.needs || '',
          interests: profile.interests || [],
          workplace: profile.workplace || '',
        });

        const response = await fetch('/api/icebreakers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentUserProfile: toAiProfile(currentUserProfileDoc.data() as UserProfile),
            matchedUserProfile: toAiProfile(matchedUserProfileDoc.data() as UserProfile),
          }),
        });

        if (!response.ok) {
          setAiSuggestions(localIcebreakerFallback(fallbackName));
          return;
        }

        const result = await response.json() as Partial<AiIcebreakerSuggestionOutput>;
        if (!Array.isArray(result.icebreakerMessages) || !Array.isArray(result.tips)) {
          setAiSuggestions(localIcebreakerFallback(fallbackName));
          return;
        }
        setAiSuggestions(result as AiIcebreakerSuggestionOutput);
    } catch (error: unknown) {
        const aiError = error as FirestoreError;
        console.error('Icebreaker fallback path:', aiError.message ?? error);
        setAiSuggestions(localIcebreakerFallback('there'));
    } finally {
        setIsLoadingAi(false);
    }
  };

  if (loading || authLoading) {
    return <div className="flex items-center justify-center h-screen"><div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }
  if (loadError) {
    return <div className="flex items-center justify-center h-screen">{loadError}</div>;
  }
  if (!conversationId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Invalid conversation ID</p>
      </div>
    );
  }
  const otherUserId = conversation?.userIds?.find((id: string) => id !== user?.uid);
  const otherUserProfile = otherUserId ? conversation?.userProfiles?.[otherUserId] : null;
  const currentUserProfile = user?.uid ? conversation?.userProfiles?.[user.uid] : null;

  if (!otherUserProfile || !currentUserProfile) {
    return <div className="flex items-center justify-center h-screen">Loading chat...</div>;
  }

  return (
    <AuthGuard>
      <div className="ss-page-shell">
      <div className="messages-shell-wrap">
      <div className="chat-shell">
        {/* Header */}
        <div className="chat-head">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 ss-pill-btn-outline"
            onClick={handleBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="chat-user-avatar">
            <AvatarImage src={otherUserProfile.photoURLs[0]} className="object-cover" />
            <AvatarFallback>{otherUserProfile.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <h2 className="font-semibold text-lg text-[var(--navy)]">{otherUserProfile.name}</h2>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && (
              <div className="text-center my-4">
                  <Button variant="outline" className="ss-pill-btn-outline" onClick={() => { setIsAiOpen(true); handleGetIcebreakers(); }}>
                      <Sparkles className="mr-2 h-4 w-4 text-primary" />
                      Need help breaking the ice?
                  </Button>
              </div>
          )}

          {messages.map((message) => {
            const isSender = message.senderId === user?.uid;
            const profile = isSender ? currentUserProfile : otherUserProfile;
            return (
              <div key={message.id} className={cn('flex items-end gap-2', isSender ? 'justify-end' : 'justify-start')}>
                {!isSender && (
                  <Avatar className="chat-row-avatar">
                    <AvatarImage src={profile.photoURLs[0]} className="object-cover" />
                    <AvatarFallback>{profile.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                <div className={cn('chat-bubble', isSender ? 'me' : 'other')}>
                  <p className="text-sm">{message.text}</p>
                   {message.createdAt && (
                      <p className="text-xs text-right mt-1 opacity-70">
                        {format((message.createdAt as Timestamp).toDate(), 'p')}
                      </p>
                  )}
                </div>
                {isSender && (
                  <Avatar className="chat-row-avatar">
                    <AvatarImage src={profile.photoURLs[0]} className="object-cover" />
                    <AvatarFallback>{profile.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-wrap">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message... 😊"
              maxLength={MAX_MESSAGE_LENGTH}
              className="flex-1 chat-input"
              autoComplete="off"
            />
            <Button type="submit" size="icon" className="ss-pill-btn" disabled={!newMessage.trim() || newMessage.trim().length > MAX_MESSAGE_LENGTH}>
              <Send className="h-5 w-5" />
            </Button>
          </form>
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {newMessage.length}/{MAX_MESSAGE_LENGTH}
          </p>
        </div>

        {/* AI Icebreaker Dialog */}
        <Dialog open={isAiOpen} onOpenChange={setIsAiOpen}>
          <DialogContent className="w-[92vw] max-w-[560px] rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 px-6 pt-6 font-headline text-xl">
                <Sparkles className="text-primary" />
                AI Icebreaker Suggestions
              </DialogTitle>
              <DialogDescription className="px-6 pb-2 text-sm">
                Here are a few ideas to get the conversation started with {otherUserProfile.name}.
              </DialogDescription>
            </DialogHeader>
            {isLoadingAi ? (
                <div className="flex h-32 items-center justify-center px-6">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            ) : (
              <div className="grid gap-4 px-6 py-2">
                <div>
                  <h4 className="font-semibold mb-2">Message Ideas:</h4>
                  <ul className="list-disc list-inside space-y-2 text-sm">
                    {aiSuggestions?.icebreakerMessages.map((msg, i) => (
                      <li key={i} className="text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => {setNewMessage(msg); setIsAiOpen(false);}}>{msg}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Conversation Tips:</h4>
                   <ul className="list-disc list-inside space-y-2 text-sm">
                    {aiSuggestions?.tips.map((tip, i) => (
                      <li key={i} className="text-muted-foreground">{tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <DialogFooter className="border-t border-slate-200 px-6 py-4">
              <Button className="ss-pill-btn" onClick={() => setIsAiOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      </div>
      </div>
    </AuthGuard>
  );
}

