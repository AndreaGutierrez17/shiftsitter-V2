'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Conversation, Message, Shift, UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { AuthGuard } from '@/components/AuthGuard';
import { calculateCompatibility } from '@/lib/match/calculateCompatibility';

type FirestoreError = { message?: string };
type AiIcebreakerSuggestionOutput = {
  icebreakerMessages: string[];
  tips: string[];
};
type AssistantReplyPayload = {
  advice?: string;
  source?: 'ai' | 'fallback';
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
    `Hi ${name}. Would you like to compare availability for this week?`,
    `Before we plan a shift, would it help to confirm routines, care notes, and preferred timing?`,
    `I can share my schedule and handoff details first so we can find a good fit.`,
  ],
  tips: [
    'Lead with schedule overlap, routines, and the child’s needs.',
    'Clarify pickup, drop-off, timing, and care notes before confirming a shift.',
    'Keep the first exchange practical and focused on expectations.',
  ],
});

const buildLocalChatAssistantFallback = (prompt: string) => {
  const text = prompt.trim().toLowerCase();

  if (!text) {
    return 'I can help with timing, expectations, handoff details, cancellations, reviews, and what to say next.';
  }

  if (['hi', 'hello', 'hey', 'hola', 'hello!', 'hi!'].includes(text)) {
    return 'Hello. I can help with schedules, expectations, handoff details, and the next step in the conversation. What would you like help with?';
  }

  if (
    text.includes('confirm') ||
    text.includes('confirmation') ||
    text.includes('what next') ||
    text.includes('next step') ||
    text.includes('after accepting')
  ) {
    return 'After a confirmation, the next step is to align on timing, handoff details, routines, and any care notes. Once that is clear, both sides can move forward with a simple plan.';
  }

  if (text.includes('cancel')) {
    return 'If plans need to change, send a direct note early, explain briefly, and offer a replacement time if possible. Keep the message focused on logistics so the other side can respond quickly.';
  }

  if (text.includes('review') || text.includes('rating') || text.includes('stars')) {
    return 'A useful review should mention reliability, communication, punctuality, and whether expectations matched what was agreed. Keep it specific and focused on the shift itself.';
  }

  if (text.includes('message') || text.includes('say') || text.includes('write')) {
    return 'A clear next message usually confirms timing, routines, handoff details, and any care notes. Short, specific messages work better than vague ones.';
  }

  return 'A practical next step is to confirm timing, expectations, handoff details, and any care notes. If you want, ask what to say next and I will help you phrase it clearly.';
};

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
  const [isChatAssistantOpen, setIsChatAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantAnswer, setAssistantAnswer] = useState('');
  const [isChatAssistantLoading, setIsChatAssistantLoading] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [isEndingMatch, setIsEndingMatch] = useState(false);
  const [isClosingConversation, setIsClosingConversation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [muted, setMuted] = useState(false);
  const [relatedShifts, setRelatedShifts] = useState<Shift[]>([]);
  const [fullProfiles, setFullProfiles] = useState<{ current: UserProfile | null; other: UserProfile | null }>({
    current: null,
    other: null,
  });
  const [secureAccessProfile, setSecureAccessProfile] = useState<UserProfile | null | undefined>(undefined);
  const [messageUnreadCounts, setMessageUnreadCounts] = useState<Record<string, number>>({});
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
    if (!user || isClosingConversation) return;
    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      setSecureAccessProfile(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as UserProfile) : null);
    });
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
    return () => {
      unsubscribeProfile();
      unsubscribe();
    };
  }, [isClosingConversation, user]);

  useEffect(() => {
    if (!user || isClosingConversation) {
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
        const unreadConversationId = typeof data.data?.conversationId === 'string' ? data.data.conversationId : '';
        if (!unreadConversationId) return;
        nextCounts[unreadConversationId] = (nextCounts[unreadConversationId] || 0) + 1;
      });
      setMessageUnreadCounts(nextCounts);
    });

    return () => unsubscribe();
  }, [isClosingConversation, user]);

  useEffect(() => {
    if (!user || !conversationId || isClosingConversation) return;

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
  }, [conversationId, isClosingConversation, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth >= 641) {
      setShowDetails(true);
    }
  }, []);

  useEffect(() => {
    if (!user || !conversationId || !conversation || isClosingConversation) return;
    const unreadForMe = Number(messageUnreadCounts[conversationId] || conversation.unreadCount?.[user.uid] || 0);
    if (unreadForMe <= 0) return;

    const conversationRef = doc(db, 'conversations', conversationId);
    const unreadNotificationsQuery = query(
      collection(db, 'notifications', user.uid, 'items'),
      where('type', '==', 'message'),
      where('read', '==', false),
      where('data.conversationId', '==', conversationId)
    );

    const timeout = window.setTimeout(async () => {
      try {
        await updateDoc(conversationRef, {
          [`unreadCount.${user.uid}`]: 0,
        });

        const unsubscribe = onSnapshot(unreadNotificationsQuery, async (snapshot) => {
          unsubscribe();
          if (snapshot.empty) return;
          const batch = writeBatch(db);
          snapshot.docs.forEach((row) => {
            batch.update(row.ref, {
              read: true,
              readAt: serverTimestamp(),
            });
          });
          await batch.commit();
        });
      } catch (error) {
        console.error('Could not clear unread count:', error);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [conversation, conversationId, isClosingConversation, messageUnreadCounts, user]);

  const otherUserId = conversation?.userIds?.find((id: string) => id !== user?.uid);
  const otherUserProfile = otherUserId ? conversation?.userProfiles?.[otherUserId] : null;
  const currentUserProfile = user?.uid ? conversation?.userProfiles?.[user.uid] : null;

  useEffect(() => {
    if (!user || !otherUserId || isClosingConversation) return;
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
  }, [isClosingConversation, otherUserId, user]);

  useEffect(() => {
    if (!user || !otherUserId || isClosingConversation) {
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
  }, [isClosingConversation, otherUserId, user]);

  const compatibility = useMemo(
    () => calculateCompatibility(fullProfiles.current ?? undefined, fullProfiles.other ?? undefined),
    [fullProfiles.current, fullProfiles.other]
  );
  const completedShiftInitiatedByMe = relatedShifts.filter((shift) => shift.status === 'completed' && shift.proposerId === user?.uid).length;
  const completedShiftInitiatedByThem = relatedShifts.filter((shift) => shift.status === 'completed' && shift.proposerId !== user?.uid).length;
  const proposalBalance = completedShiftInitiatedByMe - completedShiftInitiatedByThem;
  const canAccessSecureMessaging = Boolean(
    secureAccessProfile &&
    (
      secureAccessProfile.isDemo ||
      secureAccessProfile.verificationStatus === 'verified'
    )
  );

  const buildAssistantContext = () => {
    const me = fullProfiles.current;
    const other = fullProfiles.other;
    return [
      `Current user: ${me?.name || 'Unknown'}`,
      `Current user location: ${me?.location || 'Unknown'}`,
      `Current user availability: ${me?.availability || 'Not provided'}`,
      `Current user needs: ${me?.needs || 'Not provided'}`,
      `Matched user: ${other?.name || 'Unknown'}`,
      `Matched user location: ${other?.location || 'Unknown'}`,
      `Matched user availability: ${other?.availability || 'Not provided'}`,
      `Matched user needs: ${other?.needs || 'Not provided'}`,
      `Conversation context: private ShiftSitter childcare coordination chat.`,
    ].join('\n');
  };


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
    } catch (error: unknown) {
      const notifyError = error as FirestoreError;
      console.error('Message send failed:', notifyError.message ?? error);
      setSendError('Could not send message. Please try again.');
      setNewMessage(msgText);
    } finally {
      setIsSending(false);
    }
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
      const storageRef = ref(storage, `message-attachments/${user.uid}/${conversationId}/${Date.now()}-${safeName}`);
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

  const handleAskChatAssistant = async () => {
    const prompt = assistantQuestion.trim();
    if (!prompt || isChatAssistantLoading) return;

    setIsChatAssistantLoading(true);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: prompt,
          userProfile: buildAssistantContext(),
        }),
      });

      const result = (await response.json().catch(() => ({}))) as AssistantReplyPayload;
      setAssistantAnswer(
        typeof result.advice === 'string' && result.advice.trim()
          ? result.advice.trim()
          : buildLocalChatAssistantFallback(prompt)
      );
    } catch (error) {
      console.error('Chat assistant request failed:', error);
      setAssistantAnswer(buildLocalChatAssistantFallback(prompt));
    } finally {
      setIsChatAssistantLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (!user || !conversationId || isClearingChat) return;

    const confirmed = window.confirm('Clear this chat history? You can still message this person again later.');
    if (!confirmed) return;

    setIsClearingChat(true);
    setSendError(null);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/conversations/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ conversationId }),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(err || 'Could not clear this chat.');
      }

      setMessages([]);
    } catch (error) {
      console.error('Clear chat failed:', error);
      setSendError('Could not clear this chat. Please try again.');
    } finally {
      setIsClearingChat(false);
    }
  };

  const handleEndMatch = async () => {
    if (!user || !conversationId || !otherUserId || isEndingMatch) return;

    const confirmed = window.confirm('End this match and remove the conversation?');
    if (!confirmed) return;

    setIsEndingMatch(true);
    setIsClosingConversation(true);
    setSendError(null);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/matches/unmatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          conversationId,
          otherUserId,
        }),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(err || 'Could not end this match.');
      }

      router.replace('/families/messages');
    } catch (error) {
      console.error('End match failed:', error);
      setSendError('Could not end this match. Please try again.');
      setIsClosingConversation(false);
    } finally {
      setIsEndingMatch(false);
    }
  };

  if (isClosingConversation) {
    return (
      <AuthGuard>
        <div className="flex h-screen items-center justify-center">
          <div className="rounded-2xl border bg-white px-6 py-5 text-center shadow-sm">
            <p className="text-sm font-medium text-[var(--navy)]">Ending match...</p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (loading || authLoading) {
    return <div className="flex items-center justify-center h-screen"><div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }
  if (user && typeof secureAccessProfile === 'undefined') {
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
  if (!canAccessSecureMessaging) {
    return (
      <AuthGuard>
        <div className="ss-page-shell">
          <div className="messages-shell-wrap">
            <div className="w-full max-w-2xl rounded-2xl border bg-white p-8 text-center shadow-sm">
              <h2 className="font-headline text-2xl">Secure Messages Locked</h2>
              <p className="mt-3 text-muted-foreground">
                Upload your ID front and selfie, then wait for manual admin approval before entering chat.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <Button onClick={() => router.push('/families/profile/edit')}>Go to Profile Edit</Button>
                <Button variant="outline" onClick={handleBack}>Back</Button>
              </div>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
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
            const unreadForMe = Math.max(
              0,
              Number(messageUnreadCounts[conv.id] || conv.unreadCount?.[user?.uid || ''] || 0)
            );
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
                    <div className="flex items-center gap-2">
                      {unreadForMe > 0 ? (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-5 text-white">
                          {unreadForMe > 9 ? '9+' : unreadForMe}
                        </span>
                      ) : null}
                      <span className="chat-sidebar-item-time">
                        {conv.lastMessageAt && typeof (conv.lastMessageAt as Timestamp)?.toDate === 'function'
                          ? formatDistanceToNow((conv.lastMessageAt as Timestamp).toDate(), { addSuffix: true })
                          : ''}
                      </span>
                    </div>
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
          <div className="chat-conversation-head">
            <Button
              variant="ghost"
              size="icon"
              className="chat-quick-back ss-pill-btn-outline md:hidden"
              onClick={handleBack}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="chat-user-avatar">
              <AvatarImage src={otherUserProfile.photoURLs?.[0]} className="object-cover" />
              <AvatarFallback>{otherUserProfile.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="chat-thread-name">{otherUserProfile.name}</h2>
              <p className="chat-thread-subtitle">Secure chat</p>
            </div>
          </div>
          <div className="chat-toolbar">
            <button
              type="button"
              className="chat-icon-btn"
              title="ShiftSitter Assistant"
              onClick={() => setIsChatAssistantOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
            </button>
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
                <DropdownMenuItem onClick={() => router.push('/families/calendar')}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  View Shifts
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClearChat} disabled={isClearingChat}>
                  {isClearingChat ? 'Clearing Chat...' : 'Clear Chat'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleEndMatch}
                  disabled={isEndingMatch}
                  className="text-destructive focus:text-destructive"
                >
                  {isEndingMatch ? 'Ending Match...' : 'End Match'}
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
                  <Button variant="outline" className="ss-pill-btn-outline chat-empty-cta" onClick={() => { setIsAiOpen(true); handleGetIcebreakers(); }}>
                      <Sparkles className="mr-2 h-4 w-4 text-primary" />
                      Need help starting the care conversation?
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
            <input
              id="chat-attachment-input"
              type="file"
              className="sr-only"
              accept=".pdf,.doc,.docx,.txt,image/*"
              onChange={handleAttachmentSelected}
              disabled={isUploadingAttachment}
            />
            <label
              htmlFor="chat-attachment-input"
              className={cn('chat-attach-btn', isUploadingAttachment && 'pointer-events-none opacity-60')}
              title="Attach CV or document"
            >
              <Paperclip className="h-5 w-5" />
            </label>
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={isUploadingAttachment ? 'Uploading attachment...' : 'Type a message...'}
              maxLength={MAX_MESSAGE_LENGTH}
              className="flex-1 chat-input"
              autoComplete="off"
              disabled={isUploadingAttachment}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="ss-pill-btn-outline chat-assist-btn"
              onClick={() => setIsChatAssistantOpen(true)}
              title="Ask ShiftSitter Assistant"
            >
              <Sparkles className="h-5 w-5" />
            </Button>
            <Button type="submit" size="icon" className="ss-pill-btn chat-send-btn" disabled={isSending || isUploadingAttachment || !newMessage.trim() || newMessage.trim().length > MAX_MESSAGE_LENGTH}>
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
                Here are a few childcare-focused ways to start the conversation with {otherUserProfile.name}.
              </DialogDescription>
            </DialogHeader>
            {isLoadingAi ? (
                <div className="flex h-32 items-center justify-center px-6">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            ) : (
              <div className="grid gap-4 px-6 py-2">
                <div>
                  <h4 className="font-semibold mb-2">Care-focused message ideas:</h4>
                  <ul className="list-disc list-inside space-y-2 text-sm">
                    {aiSuggestions?.icebreakerMessages.map((msg, i) => (
                      <li key={i} className="text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => {setNewMessage(msg); setIsAiOpen(false);}}>{msg}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Conversation tips:</h4>
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

        <Dialog open={isChatAssistantOpen} onOpenChange={setIsChatAssistantOpen}>
          <DialogContent className="w-[92vw] max-w-[620px] rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl" lang="en" translate="no">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 px-6 pt-6 font-headline text-xl">
                <Sparkles className="text-primary" />
                ShiftSitter Assistant
              </DialogTitle>
              <DialogDescription className="px-6 pb-2 text-sm">
                Get quick help with timing, expectations, handoff details, or what to say next.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 px-6 py-2">
              <Textarea
                value={assistantQuestion}
                onChange={(event) => setAssistantQuestion(event.target.value)}
                rows={4}
                maxLength={600}
                placeholder="Example: What should I confirm before tomorrow's shift?"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{assistantQuestion.length}/600</p>
                <Button type="button" className="ss-pill-btn" onClick={handleAskChatAssistant} disabled={isChatAssistantLoading || !assistantQuestion.trim()}>
                  {isChatAssistantLoading ? 'Thinking...' : 'Ask'}
                </Button>
              </div>
              {isChatAssistantLoading || assistantAnswer ? (
                <div className="rounded-xl border bg-slate-50 p-4">
                  {isChatAssistantLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Thinking through the next step...
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {assistantAnswer}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <DialogFooter className="border-t border-slate-200 px-6 py-4">
              <Button className="ss-pill-btn" onClick={() => setIsChatAssistantOpen(false)}>Close</Button>
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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {fullProfiles.other?.verificationStatus === 'verified' ? 'Verified' : 'Unverified'}
          </p>
          <Link href={`/families/profile/${otherUserId}`} className="chat-details-link">View profile</Link>
        </div>
        <div className="chat-details-section">
          <div className="chat-details-row-head">
            <h4>Compatibility</h4>
            <span className="chat-details-score">{compatibility.totalScore}%</span>
          </div>
          {typeof compatibility.distanceKm === 'number' ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Approx. distance: {compatibility.distanceKm} km
              {typeof compatibility.estimatedTravelMinutes === 'number' ? ` • ${compatibility.estimatedTravelMinutes} min est.` : ''}
            </p>
          ) : null}
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
            <h4>Shifts</h4>
            <button type="button" className="chat-mini-link" onClick={() => router.push('/families/calendar')}>Open</button>
          </div>
          <p className="text-sm text-muted-foreground">Shared shifts: {relatedShifts.length}</p>
          <p className="text-sm text-muted-foreground">Accepted: {relatedShifts.filter(s => s.status === 'accepted').length}</p>
          <p className="text-sm text-muted-foreground">Completed: {relatedShifts.filter(s => s.status === 'completed').length}</p>
          <div className="mt-3 rounded-lg border border-border/80 bg-white/70 p-3 text-sm">
            <p className="font-medium text-foreground">Exchange Ledger</p>
            <p className="mt-1 text-muted-foreground">You initiated: {completedShiftInitiatedByMe}</p>
            <p className="text-muted-foreground">They initiated: {completedShiftInitiatedByThem}</p>
            <p className="text-muted-foreground">Net balance: {proposalBalance > 0 ? `+${proposalBalance}` : proposalBalance}</p>
          </div>
          <button type="button" className="chat-details-danger-link" onClick={() => router.push('/families/calendar')}>
            View Shifts
          </button>
        </div>
      </aside>
      </div>
      </div>
      </div>
    </AuthGuard>
  );
}

