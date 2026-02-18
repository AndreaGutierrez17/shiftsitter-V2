'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Message, UserProfile } from '@/lib/types';
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
import { aiIcebreakerSuggestion, AiIcebreakerSuggestionOutput, type AiIcebreakerSuggestionInput } from '@/ai/flows/ia-icebreaker-suggestion-flow';
import { db } from '@/lib/firebase/client';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { AuthGuard } from '@/components/AuthGuard';


export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiIcebreakerSuggestionOutput | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversationId = params.id as string;

  useEffect(() => {
    if (!user) return;

    // Fetch conversation details
    const convDocRef = doc(db, 'conversations', conversationId);
    const unsubConv = onSnapshot(convDocRef, (doc) => {
      if (doc.exists()) {
        setConversation({ id: doc.id, ...doc.data() });
      }
      setLoading(false);
    });

    // Fetch messages
    const messagesQuery = query(collection(db, 'conversations', conversationId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubMessages = onSnapshot(messagesQuery, (querySnapshot) => {
      const msgs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    });

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
    if (newMessage.trim() === '' || !user) return;

    const msgText = newMessage;
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
  };
  
  const handleGetIcebreakers = async () => {
    if (!user || !conversation) return;
    setIsLoadingAi(true);
    try {
        const otherUserId = conversation.userIds.find((id: string) => id !== user.uid);
        
        const currentUserProfileDoc = await getDoc(doc(db, 'users', user.uid));
        const matchedUserProfileDoc = await getDoc(doc(db, 'users', otherUserId));

        if (!currentUserProfileDoc.exists() || !matchedUserProfileDoc.exists()) {
            throw new Error("Could not fetch user profiles");
        }

        const toAiProfile = (
          profile: UserProfile
        ): AiIcebreakerSuggestionInput["currentUserProfile"] => ({
          id: profile.id,
          name: profile.name,
          location: profile.location,
          childAge: profile.childAge,
          availability: profile.availability || '',
          needs: profile.needs || '',
          interests: profile.interests || [],
          workplace: profile.workplace || '',
        });

        const result = await aiIcebreakerSuggestion({
            currentUserProfile: toAiProfile(currentUserProfileDoc.data() as UserProfile),
            matchedUserProfile: toAiProfile(matchedUserProfileDoc.data() as UserProfile),
        });
        setAiSuggestions(result);
    } catch (error) {
        console.error("Failed to get AI suggestions", error);
    } finally {
        setIsLoadingAi(false);
    }
  };

  if (loading || authLoading) {
    return <div className="flex items-center justify-center h-screen"><div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }
  
  const otherUserId = conversation?.userIds.find((id: string) => id !== user?.uid);
  const otherUserProfile = otherUserId ? conversation.userProfiles[otherUserId] : null;
  const currentUserProfile = user?.uid ? conversation?.userProfiles[user.uid] : null;

  if (!otherUserProfile || !currentUserProfile) {
    return <div className="flex items-center justify-center h-screen">Loading chat...</div>;
  }

  return (
    <AuthGuard>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Header */}
        <div className="flex items-center p-3 border-b">
          <Button variant="ghost" size="icon" className="mr-2" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-10 w-10 mr-3">
            <AvatarImage src={otherUserProfile.photoURLs[0]} />
            <AvatarFallback>{otherUserProfile.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <h2 className="font-semibold text-lg">{otherUserProfile.name}</h2>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
              <div className="text-center my-4">
                  <Button variant="outline" onClick={() => { setIsAiOpen(true); handleGetIcebreakers(); }}>
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
                {!isSender && <Avatar className="h-8 w-8"><AvatarImage src={profile.photoURLs[0]} /><AvatarFallback>{profile.name.charAt(0)}</AvatarFallback></Avatar>}
                <div
                  className={cn(
                    'max-w-xs md:max-w-md lg:max-w-lg rounded-2xl px-4 py-2',
                    isSender ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-accent text-accent-foreground rounded-bl-none'
                  )}
                >
                  <p className="text-sm">{message.text}</p>
                   {message.createdAt && (
                      <p className="text-xs text-right mt-1 opacity-70">
                        {format((message.createdAt as Timestamp).toDate(), 'p')}
                      </p>
                  )}
                </div>
                {isSender && <Avatar className="h-8 w-8"><AvatarImage src={profile.photoURLs[0]} /><AvatarFallback>{profile.name.charAt(0)}</AvatarFallback></Avatar>}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t bg-background">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
              autoComplete="off"
            />
            <Button type="submit" size="icon" disabled={!newMessage.trim()}>
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>

        {/* AI Icebreaker Dialog */}
        <Dialog open={isAiOpen} onOpenChange={setIsAiOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-headline">
                <Sparkles className="text-primary" />
                AI Icebreaker Suggestions
              </DialogTitle>
              <DialogDescription>
                Here are a few ideas to get the conversation started with {otherUserProfile.name}.
              </DialogDescription>
            </DialogHeader>
            {isLoadingAi ? (
                <div className="flex justify-center items-center h-32">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            ) : (
              <div className="grid gap-4 py-4">
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
            <DialogFooter>
              <Button onClick={() => setIsAiOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
}
