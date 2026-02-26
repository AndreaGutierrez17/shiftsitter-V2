'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Conversation, Message, Shift, UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Send, Sparkles, MoreVertical, Paperclip, FileText, ImageIcon, CalendarDays, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { db, storage } from '@/lib/firebase/client';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, where } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { AuthGuard } from '@/components/AuthGuard';
import { calculateCompatibility } from '@/lib/match/calculateCompatibility';

type FirestoreError = { message?: string };
type AiIcebreakerSuggestionOutput = {
  icebreakerMessages: string[];
  tips: string[];
};
const MAX_MESSAGE_LENGTH = 500;
const MAX_ATTACHMENT_MB = 8;
const BLOCKED_DOC_KEYWORDS = ['license', 'licencia', 'id', 'identification', 'passport', 'driver'];

const validateChatAttachment = (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (BLOCKED_DOC_KEYWORDS.some((token) => lowerName.includes(token))) {
    return { ok: false, reason: 'ID/licence documents cannot be sent in chat.' };
  }

  const allowedMime = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];
  const mimeOk = file.type.startsWith('image/') || allowedMime.includes(file.type);
  if (!mimeOk) return { ok: false, reason: 'Only images, PDF, DOC, DOCX, or TXT files are allowed.' };
  if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
    return { ok: false, reason: `Max file size is ${MAX_ATTACHMENT_MB}MB.` };
  }
  return { ok: true as const };
};

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
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showDetails, setShowDetails] = useState(true);
  const [muted, setMuted] = useState(false);
  const [relatedShifts, setRelatedShifts] = useState<Shift[]>([]);
  const [fullProfiles, setFullProfiles] = useState<{ current: UserProfile | null; other: UserProfile | null }>({
    current: null,
    other: null,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!user) return;
    const listQuery = query(collection(db, 'conversations'), where('userIds', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(listQuery, (snapshot) => {
      const convs = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Conversation))
        .sort((a, b) => {
          const aTime = typeof (a.lastMessageAt as Timestamp)?.toMillis === 'function' ? (a.lastMessageAt as Timestamp).toMillis() : 0;
          const bTime = typeof (b.lastMessageAt as Timestamp)?.toMillis === 'function' ? (b.lastMessageAt as Timestamp).toMillis() : 0;
          return bTime - aTime;
        });
      setConversations(convs);
    });
    return () => unsubscribe();
  }, [user]);

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

  const otherUserId = conversation?.userIds?.find((id: string) => id !== user?.uid);
  const otherUserProfile = otherUserId ? conversation?.userProfiles?.[otherUserId] : null;
  const currentUserProfile = user?.uid ? conversation?.userProfiles?.[user.uid] : null;

  useEffect(() => {
    if (!user || !otherUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const [meDoc, otherDoc] = await Promise.all([
          getDoc(doc(db, 'users', user.uid)),
          getDoc(doc(db, 'users', otherUserId)),
        ]);
        if (cancelled) return;
        setFullProfiles({
          current: meDoc.exists() ? ({ id: meDoc.id, ...meDoc.data() } as UserProfile) : null,
          other: otherDoc.exists() ? ({ id: otherDoc.id, ...otherDoc.data() } as UserProfile) : null,
        });
      } catch (error) {
        console.error('Error loading chat profile details:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [user, otherUserId]);

  useEffect(() => {
    if (!user || !otherUserId) {
      setRelatedShifts([]);
      return;
    }
    const qShifts = query(collection(db, 'shifts'), where('userIds', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(qShifts, (snapshot) => {
      const rows = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Shift))
        .filter((shift) => Array.isArray(shift.userIds) && shift.userIds.includes(otherUserId));
      setRelatedShifts(rows);
    });
    return () => unsubscribe();
  }, [user, otherUserId]);

  const compatibility = useMemo(
    () => calculateCompatibility(fullProfiles.current ?? undefined, fullProfiles.other ?? undefined),
    [fullProfiles.current, fullProfiles.other]
  );


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = newMessage.trim();
    if (!user || trimmedMessage === '' || trimmedMessage.length > MAX_MESSAGE_LENGTH) return;

    setIsSending(true);
    setSendError(null);
    const msgText = trimmedMessage;
    setNewMessage('');
    try {
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
      console.error('Message send failed:', notifyError.message ?? error);
      setSendError('Could not send message. Please try again.');
      setNewMessage(msgText);
    } finally {
      setIsSending(false);
    }
  };

  const handleAttachmentPick = () => {
    fileInputRef.current?.click();
  };

  const handleAttachmentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user || !conversationId) return;

    const validation = validateChatAttachment(file);
    if (!validation.ok) {
      setSendError(validation.reason);
      return;
    }

    setIsUploadingAttachment(true);
    setSendError(null);
    try {
      const safeName = file.name.replace(/[^\w.\- ]+/g, '_');
      const storageRef = ref(storage, `message-attachments/${conversationId}/${Date.now()}-${safeName}`);
      const snapshot = await uploadBytes(storageRef, file);
      const attachmentUrl = await getDownloadURL(snapshot.ref);
      const summary = file.type.startsWith('image/') ? 'Shared an image attachment' : `Shared document: ${file.name}`;

      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        conversationId,
        senderId: user.uid,
        text: '',
        attachmentUrl,
        attachmentName: file.name,
        attachmentType: file.type || 'application/octet-stream',
        attachmentSizeBytes: file.size,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: summary,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
      });
    } catch (error) {
      console.error('Attachment upload failed:', error);
      setSendError('Could not upload attachment. Please try again.');
    } finally {
      setIsUploadingAttachment(false);
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
  if (!otherUserProfile || !currentUserProfile) {
    return <div className="flex items-center justify-center h-screen">Loading chat...</div>;
  }

  return (
    <AuthGuard>
      <div className="ss-page-shell">
      <div className="messages-shell-wrap">
      <div className={cn('chat-workspace', showDetails && 'chat-workspace--details')}>
      <aside className="chat-sidebar">
        <div className="chat-sidebar-top">
          <div>
            <h3 className="font-headline chat-sidebar-title">Chats</h3>
            <p className="chat-sidebar-subtitle">Matches and conversations</p>
          </div>
        </div>
        <div className="chat-sidebar-list">
          {conversations.map((conv) => {
            const listOtherId = conv.userIds.find((id) => id !== user?.uid);
            const listOther = listOtherId ? conv.userProfiles?.[listOtherId] : null;
            if (!listOther) return null;
            return (
              <Link
                key={conv.id}
                href={`/families/messages/${conv.id}`}
                className={cn('chat-sidebar-item', conv.id === conversationId && 'active')}
              >
                <Avatar className="chat-sidebar-avatar">
                  <AvatarImage src={listOther.photoURLs?.[0]} />
                  <AvatarFallback>{(listOther.name || 'U').charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="chat-sidebar-item-head">
                    <p className="chat-sidebar-item-name">{listOther.name || 'Unknown user'}</p>
                    <span className="chat-sidebar-item-time">
                      {conv.lastMessageAt && typeof (conv.lastMessageAt as Timestamp)?.toDate === 'function'
                        ? formatDistanceToNow((conv.lastMessageAt as Timestamp).toDate(), { addSuffix: true })
                        : ''}
                    </span>
                  </div>
                  <p className="chat-sidebar-item-preview">
                    {conv.lastMessageSenderId === user?.uid ? 'You: ' : ''}{conv.lastMessage || 'No messages yet.'}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </aside>
      <div className="chat-shell chat-shell--workspace">
        {/* Header */}
        <div className="chat-head chat-head--workspace">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="mr-1 ss-pill-btn-outline md:hidden"
              onClick={handleBack}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="chat-user-avatar">
              <AvatarImage src={otherUserProfile.photoURLs?.[0]} className="object-cover" />
              <AvatarFallback>{otherUserProfile.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="font-semibold text-lg text-[var(--navy)] truncate">{otherUserProfile.name}</h2>
              <p className="text-xs text-muted-foreground">Secure chat</p>
            </div>
          </div>
          <div className="chat-toolbar">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="chat-icon-btn" title="More"><MoreVertical className="h-4 w-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setShowDetails(true)}>
                  <Info className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMuted(v => !v)}>
                  {muted ? 'Unmute Notifications' : 'Mute Notifications'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/families/calendar')} className="text-destructive focus:text-destructive">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  View Calendar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="chat-security-banner">Messages are private to this conversation.</div>

        {/* Messages */}
        <div className="chat-messages chat-messages--workspace">
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
                  {message.attachmentUrl && (
                    <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="chat-attachment-link">
                      {(message.attachmentType || '').startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      <span className="truncate">{message.attachmentName || 'Attachment'}</span>
                    </a>
                  )}
                  {message.text ? <p className="text-sm">{message.text}</p> : null}
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
          {sendError && <p className="mb-2 text-xs text-destructive">{sendError}</p>}
          <form onSubmit={handleSendMessage} className="chat-input-form">
            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,image/*" onChange={handleAttachmentSelected} />
            <button type="button" className="chat-attach-btn" onClick={handleAttachmentPick} disabled={isUploadingAttachment} title="Attach CV or document">
              <Paperclip className="h-5 w-5" />
            </button>
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={isUploadingAttachment ? 'Uploading attachment...' : 'Type a message...'}
              maxLength={MAX_MESSAGE_LENGTH}
              className="flex-1 chat-input"
              autoComplete="off"
              disabled={isUploadingAttachment}
            />
            <Button type="submit" size="icon" className="ss-pill-btn" disabled={isSending || isUploadingAttachment || !newMessage.trim() || newMessage.trim().length > MAX_MESSAGE_LENGTH}>
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
      <aside className={cn('chat-details-panel', !showDetails && 'chat-details-panel--hidden')}>
        <div className="chat-details-head">
          <h3>Information</h3>
          <button type="button" className="chat-icon-btn" onClick={() => setShowDetails(false)}>
            <ArrowLeft className="h-4 w-4 rotate-180" />
          </button>
        </div>
        <div className="chat-details-card">
          <Avatar className="chat-details-avatar">
            <AvatarImage src={otherUserProfile.photoURLs?.[0]} />
            <AvatarFallback>{otherUserProfile.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <h4>{otherUserProfile.name}</h4>
          <p>{fullProfiles.other?.location || 'Location unavailable'}</p>
          <Link href={`/families/profile/${otherUserId}`} className="chat-details-link">View profile</Link>
        </div>
        <div className="chat-details-section">
          <div className="chat-details-row-head">
            <h4>Compatibility</h4>
            <span className="chat-details-score">{compatibility.totalScore}%</span>
          </div>
          {[
            ['Distance / Travel', compatibility.breakdown.distance],
            ['Schedule Overlap', compatibility.breakdown.schedule],
            ['Safety Alignment', compatibility.breakdown.safety],
            ['Kids Capacity', compatibility.breakdown.kids],
            ['Handoff / Pickup', compatibility.breakdown.handoff],
          ].map(([label, value]) => (
            <div key={String(label)} className="chat-details-bar-row">
              <div className="flex items-center justify-between text-xs">
                <span>{label}</span>
                <span>{value}%</span>
              </div>
              <div className="chat-details-bar-track">
                <div className="chat-details-bar-fill" style={{ width: `${Math.max(0, Math.min(100, Number(value)))}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="chat-details-section">
          <div className="chat-details-row-head">
            <h4>Calendar</h4>
            <button type="button" className="chat-mini-link" onClick={() => router.push('/families/calendar')}>Open</button>
          </div>
          <p className="text-sm text-muted-foreground">Shared shifts: {relatedShifts.length}</p>
          <p className="text-sm text-muted-foreground">Accepted: {relatedShifts.filter(s => s.status === 'accepted').length}</p>
          <p className="text-sm text-muted-foreground">Completed: {relatedShifts.filter(s => s.status === 'completed').length}</p>
          <button type="button" className="chat-details-danger-link" onClick={() => router.push('/families/calendar')}>
            View Calendar
          </button>
        </div>
      </aside>
      </div>
      </div>
      </div>
    </AuthGuard>
  );
}

