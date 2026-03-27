'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { TouchEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Conversation, Message, Shift, UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, CalendarDays, CheckCheck, Eraser, FileText, ImageIcon, Info, MoreVertical, Paperclip, Send, Sparkles, Unlink, SmilePlus, X, Trash2, Smile, ChevronDown, Reply } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { db, storage } from '@/lib/firebase/client';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, where, writeBatch, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { AuthGuard } from '@/components/AuthGuard';
import { calculateCompatibility } from '@/lib/match/calculateCompatibility';
import { getVisibleVerificationStatus } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import {
  getTimestampMillis,
  isConversationTypingActive,
  isUserOnlineFromLastSeen,
} from '@/lib/presence';

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
const REACTION_SET = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

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

const getChatAvatarSrc = (profile: { photoURLs?: string[] | null } | null | undefined) =>
  Array.isArray(profile?.photoURLs) ? profile.photoURLs[0] : undefined;

const getChatAvatarFallback = (name: string | null | undefined) =>
  typeof name === 'string' && name.trim().length > 0 ? name.trim().charAt(0).toUpperCase() : 'U';

export default function ChatPage() {
  const rawParams = useParams();
  const params = rawParams as Record<string, string | string[] | undefined>;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyTarget, setReplyTarget] = useState<{ messageId: string; senderId: string; text: string } | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
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
  const [relatedShifts, setRelatedShifts] = useState<Shift[]>([]);
  const [fullProfiles, setFullProfiles] = useState<{ current: UserProfile | null; other: UserProfile | null }>({
    current: null,
    other: null,
  });
  const [secureAccessProfile, setSecureAccessProfile] = useState<UserProfile | null | undefined>(undefined);
  const [otherLiveProfile, setOtherLiveProfile] = useState<UserProfile | null>(null);
  const [messageUnreadCounts, setMessageUnreadCounts] = useState<Record<string, number>>({});
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const typingIdleTimeoutRef = useRef<number | null>(null);
  const lastTypingHeartbeatAtRef = useRef(0);
  const typingStateRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; message: Message } | null>(null);

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
    const intervalId = window.setInterval(() => {
      setPresenceNow(Date.now());
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!emojiPickerOpen || typeof window === 'undefined') return;
    let cancelled = false;
    let cleanup = () => {};

    const setupPicker = async () => {
      await import('emoji-picker-element');
      await customElements.whenDefined('emoji-picker');
      if (cancelled) return;
      const attachListeners = () => {
        const picker = emojiPickerRef.current;
        if (!picker) {
          requestAnimationFrame(attachListeners);
          return;
        }

        const handleEmojiClick = (event: Event) => {
          const detail = (event as CustomEvent).detail as {
            unicode?: string;
            emoji?: { unicode?: string; native?: string; emoji?: string; char?: string; symbol?: string };
          } | undefined;
          const emoji =
            detail?.unicode ||
            detail?.emoji?.unicode ||
            detail?.emoji?.native ||
            detail?.emoji?.emoji ||
            detail?.emoji?.char ||
            detail?.emoji?.symbol;
          if (!emoji) return;
          setNewMessage((prev) => `${prev}${emoji}`);
          setEmojiPickerOpen(false);
          inputRef.current?.focus();
        };

        picker.addEventListener('emoji-click', handleEmojiClick as EventListener);
        picker.addEventListener('emoji-select', handleEmojiClick as EventListener);

        const shadowRoot = (picker as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot;
        if (shadowRoot) {
          const favorites = shadowRoot.querySelector('.favorites') as HTMLElement | null;
          if (favorites) favorites.style.display = 'none';
          const tabpanel = shadowRoot.querySelector('.tabpanel') as HTMLElement | null;
          if (tabpanel) tabpanel.style.overflowX = 'hidden';
        }
        cleanup = () => {
          picker.removeEventListener('emoji-click', handleEmojiClick as EventListener);
          picker.removeEventListener('emoji-select', handleEmojiClick as EventListener);
        };
      };

      attachListeners();
    };

    void setupPicker();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [emojiPickerOpen]);

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

  const markMessagesRead = useCallback(() => {
    if (!user || !conversationId) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (messages.length === 0) return;

    const unreadFromOther = messages.filter((message) => {
      if (message.senderId === user.uid) return false;
      const readBy = Array.isArray(message.readBy) ? message.readBy : [];
      return !readBy.includes(user.uid);
    });

    if (unreadFromOther.length === 0) return;

    const chunks: Message[][] = [];
    for (let i = 0; i < unreadFromOther.length; i += 400) {
      chunks.push(unreadFromOther.slice(i, i + 400));
    }

    chunks.forEach(async (batchMessages) => {
      const batch = writeBatch(db);
      batchMessages.forEach((message) => {
        const messageRef = doc(db, 'conversations', conversationId, 'messages', message.id);
        batch.update(messageRef, {
          readBy: arrayUnion(user.uid),
          readAt: serverTimestamp(),
        });
      });
      try {
        await batch.commit();
      } catch (error) {
        console.error('Could not mark messages as read:', error);
      }
    });
  }, [conversationId, messages, user]);

  useEffect(() => {
    markMessagesRead();
  }, [markMessagesRead]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        markMessagesRead();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [markMessagesRead]);

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

  const updateTypingState = async (nextTyping: boolean, force = false) => {
    if (!user || !conversationId || isClosingConversation) return;

    const now = Date.now();
    if (
      !force &&
      nextTyping === typingStateRef.current &&
      (!nextTyping || now - lastTypingHeartbeatAtRef.current < 4_000)
    ) {
      return;
    }

    typingStateRef.current = nextTyping;
    lastTypingHeartbeatAtRef.current = now;

    try {
      await updateDoc(doc(db, 'conversations', conversationId), {
        [`typingStatus.${user.uid}`]: nextTyping,
        [`typingUpdatedAt.${user.uid}`]: serverTimestamp(),
      });
    } catch (error) {
      console.error('Could not update typing state:', error);
    }
  };

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
    if (!otherUserId || isClosingConversation) {
      setOtherLiveProfile(null);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', otherUserId), (snapshot) => {
      setOtherLiveProfile(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as UserProfile) : null);
    });

    return () => unsubscribe();
  }, [isClosingConversation, otherUserId]);

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
  const canAccessSecureMessaging = true;
  const otherUserIsTyping = otherUserId
    ? isConversationTypingActive(
        conversation?.typingStatus?.[otherUserId],
        conversation?.typingUpdatedAt?.[otherUserId],
        presenceNow
      )
    : false;
  const otherUserIsOnline = isUserOnlineFromLastSeen(otherLiveProfile?.lastSeen, presenceNow);
  const otherUserLastSeenMillis = getTimestampMillis(otherLiveProfile?.lastSeen);
  const otherUserPresenceLabel = otherUserIsTyping
    ? 'Escribiendo...'
    : otherUserIsOnline
      ? 'En línea'
      : otherUserLastSeenMillis
        ? `Desconectado · Última vez ${formatDistanceToNow(otherUserLastSeenMillis, { addSuffix: true })}`
        : 'Desconectado';

  useEffect(() => {
    if (!user || !conversationId || !canAccessSecureMessaging || isClosingConversation) return;

    const hasDraft = newMessage.trim().length > 0;

    if (!hasDraft) {
      if (typingIdleTimeoutRef.current) {
        window.clearTimeout(typingIdleTimeoutRef.current);
        typingIdleTimeoutRef.current = null;
      }
      void updateTypingState(false, true);
      return;
    }

    const now = Date.now();
    if (!typingStateRef.current || now - lastTypingHeartbeatAtRef.current >= 4_000) {
      void updateTypingState(true, !typingStateRef.current);
    }

    if (typingIdleTimeoutRef.current) {
      window.clearTimeout(typingIdleTimeoutRef.current);
    }

    typingIdleTimeoutRef.current = window.setTimeout(() => {
      typingIdleTimeoutRef.current = null;
      void updateTypingState(false, true);
    }, 2_500);

    return () => {
      if (typingIdleTimeoutRef.current) {
        window.clearTimeout(typingIdleTimeoutRef.current);
      }
    };
  }, [canAccessSecureMessaging, conversationId, isClosingConversation, newMessage, user]);

  useEffect(() => {
    if (!user || !conversationId || isClosingConversation) return;

    const clearTypingState = () => {
      void updateTypingState(false, true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTypingState();
      }
    };

    window.addEventListener('pagehide', clearTypingState);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', clearTypingState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTypingState();
    };
  }, [conversationId, isClosingConversation, user]);

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

  const buildReplyPreview = (message: Message) => {
    if (message.deletedForAll) return 'Message deleted';
    const text = message.text?.trim();
    if (text) return text;
    if (message.attachmentName) return `Attachment: ${message.attachmentName}`;
    if (message.attachmentUrl) return 'Attachment';
    return 'Message';
  };

  const handleSetReply = (message: Message) => {
    setReplyTarget({
      messageId: message.id,
      senderId: message.senderId,
      text: buildReplyPreview(message),
    });
    setActiveMessageId(null);
    inputRef.current?.focus();
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStartMessage = (message: Message, event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, message };
    longPressTriggeredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setActiveMessageId(message.id);
    }, 420);
  };

  const handleTouchMoveMessage = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);
    if (dx > 12 || dy > 12) {
      clearLongPress();
    }
  };

  const handleTouchEndMessage = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    clearLongPress();
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = (touch?.clientX ?? start.x) - start.x;
    const dy = (touch?.clientY ?? start.y) - start.y;
    touchStartRef.current = null;
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx > 60 && absDx > absDy * 1.5 && dx > 0) {
      handleSetReply(start.message);
    }
  };

  useEffect(() => {
    if (!activeMessageId) return;
    const handleOutside: EventListener = (event) => {
      const target = (event.target as HTMLElement | null);
      if (!target?.closest('.chat-message-col')) {
        setActiveMessageId(null);
      }
    };
    document.addEventListener('click', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('click', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [activeMessageId]);

  const handleToggleReaction = async (message: Message, emoji: string) => {
    if (!user || !conversationId) return;
    const current = message.reactions?.[emoji] || [];
    const reacted = current.includes(user.uid);
    try {
      await updateDoc(doc(db, 'conversations', conversationId, 'messages', message.id), {
        [`reactions.${emoji}`]: reacted ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });

      if (!reacted && message.senderId !== user.uid) {
        try {
          const idToken = await user.getIdToken();
          const actorName =
            fullProfiles.current?.name || currentUserProfile?.name || user.displayName || 'A shifter';
          await fetch('/api/notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              type: 'message',
              notificationId: `reaction_${message.id}_${emoji}_${user.uid}`,
              targetUserIds: [message.senderId],
              title: 'New reaction',
              body: `${actorName} reacted ${emoji} to your message.`,
              link: `/families/messages/${conversationId}`,
              data: {
                conversationId,
                messageId: message.id,
                emoji,
              },
            }),
          });
        } catch (notifyError) {
          console.error('Reaction notification failed:', notifyError);
        }
      }
    } catch (error) {
      const firestoreError = error as { code?: string };
      if (firestoreError?.code === 'permission-denied') {
        toast({
          variant: 'destructive',
          title: 'Permissions blocked',
          description: 'Deploy the updated Firestore rules to enable reactions.',
        });
      }
      console.error('Reaction update failed:', error);
    }
  };

  const handleDeleteForMe = async (message: Message) => {
    if (!user || !conversationId) return;
    try {
      await updateDoc(doc(db, 'conversations', conversationId, 'messages', message.id), {
        deletedFor: arrayUnion(user.uid),
      });
    } catch (error) {
      const firestoreError = error as { code?: string };
      if (firestoreError?.code === 'permission-denied') {
        toast({
          variant: 'destructive',
          title: 'Permissions blocked',
          description: 'Deploy the updated Firestore rules to delete messages.',
        });
      }
      console.error('Delete for me failed:', error);
    }
  };

  const handleDeleteForAll = async (message: Message) => {
    if (!user || !conversationId || message.senderId !== user.uid) return;
    const confirmed = window.confirm('Delete this message for everyone?');
    if (!confirmed) return;
    try {
      await updateDoc(doc(db, 'conversations', conversationId, 'messages', message.id), {
        deletedForAll: true,
        deletedBy: user.uid,
        deletedAt: serverTimestamp(),
      });
    } catch (error) {
      const firestoreError = error as { code?: string };
      if (firestoreError?.code === 'permission-denied') {
        toast({
          variant: 'destructive',
          title: 'Permissions blocked',
          description: 'Deploy the updated Firestore rules to delete messages.',
        });
      }
      console.error('Delete for all failed:', error);
    }
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
        readBy: [user.uid],
        ...(replyTarget
          ? {
              replyTo: {
                messageId: replyTarget.messageId,
                senderId: replyTarget.senderId,
                text: replyTarget.text,
              },
            }
          : {}),
      });

      const recipientId = otherUserId || conversation?.userIds?.find((id: string) => id !== user.uid) || '';
      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: msgText,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
        ...(recipientId ? { [`unreadCount.${recipientId}`]: increment(1) } : {}),
        [`unreadCount.${user.uid}`]: 0,
      });
    } catch (error: unknown) {
      const notifyError = error as FirestoreError;
      console.error('Message send failed:', notifyError.message ?? error);
      setSendError('Could not send message. Please try again.');
      setNewMessage(msgText);
    } finally {
      setIsSending(false);
      setReplyTarget(null);
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
        readBy: [user.uid],
        ...(replyTarget
          ? {
              replyTo: {
                messageId: replyTarget.messageId,
                senderId: replyTarget.senderId,
                text: replyTarget.text,
              },
            }
          : {}),
      });

      const recipientId = otherUserId || conversation?.userIds?.find((id: string) => id !== user.uid) || '';
      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: summary,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
        ...(recipientId ? { [`unreadCount.${recipientId}`]: increment(1) } : {}),
        [`unreadCount.${user.uid}`]: 0,
      });
    } catch (error) {
      console.error('Attachment upload failed:', error);
      setSendError('Could not upload attachment. Please try again.');
    } finally {
      setIsUploadingAttachment(false);
      setReplyTarget(null);
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

  return (
    <AuthGuard>
      <div className="ss-page-shell ss-page-shell--messages-page">
      <div className="messages-shell-wrap">
      <div className={cn('chat-workspace', showDetails && 'chat-workspace--details')}>
      <aside className="chat-sidebar">
        <div className="chat-sidebar-top">
          <div>
            <h3 className="font-headline chat-sidebar-title">Chats</h3>
            <p className="chat-sidebar-subtitle">Shifters and conversations</p>
          </div>
        </div>
        <div className="chat-sidebar-list">
          {conversations.map((conv) => {
            const listOtherId = conv.userIds.find((id) => id !== user?.uid);
            const listOther = listOtherId ? conv.userProfiles?.[listOtherId] : null;
            const listOtherIsTyping = listOtherId
              ? isConversationTypingActive(
                  conv.typingStatus?.[listOtherId],
                  conv.typingUpdatedAt?.[listOtherId],
                  presenceNow
                )
              : false;
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
                  <p className={cn('chat-sidebar-item-preview', listOtherIsTyping && 'text-primary')}>
                    {listOtherIsTyping
                      ? 'Escribiendo...'
                      : `${conv.lastMessageSenderId === user?.uid ? 'You: ' : ''}${conv.lastMessage || 'No messages yet.'}`}
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
            <div className="relative">
              <Avatar className="chat-user-avatar">
                <AvatarImage src={otherUserProfile.photoURLs?.[0]} className="object-cover" />
                <AvatarFallback>{getChatAvatarFallback(otherUserProfile.name)}</AvatarFallback>
              </Avatar>
            </div>
            <div className="min-w-0">
              <h2 className="chat-thread-name">{otherUserProfile.name}</h2>
              <p
                className={cn(
                  'chat-thread-subtitle',
                  otherUserIsTyping || otherUserIsOnline
                    ? 'chat-thread-subtitle--online'
                    : 'chat-thread-subtitle--offline',
                  otherUserIsTyping && 'text-primary'
                )}
              >
                {otherUserPresenceLabel}
              </p>
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
                <DropdownMenuItem onClick={() => router.push('/families/calendar')}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  View Shifts
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClearChat} disabled={isClearingChat}>
                  <Eraser className="mr-2 h-4 w-4" />
                  {isClearingChat ? 'Clearing Chat...' : 'Clear Chat'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleEndMatch}
                  disabled={isEndingMatch}
                  className="text-destructive focus:text-destructive"
                >
                  <Unlink className="mr-2 h-4 w-4" />
                  {isEndingMatch ? 'Ending connection...' : 'End connection'}
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
            const deletedFor = Array.isArray(message.deletedFor) ? message.deletedFor : [];
            const currentUserId = user?.uid;
            const isHiddenForMe = Boolean(currentUserId) && deletedFor.includes(currentUserId);
            if (isHiddenForMe) return null;
            const isDeletedForAll = Boolean(message.deletedForAll);
            const profile = isSender ? currentUserProfile : otherUserProfile;
            const isImageAttachment =
              !isDeletedForAll && Boolean(message.attachmentUrl) && (message.attachmentType || '').startsWith('image/');
            const messageCreatedAt =
              typeof (message.createdAt as Timestamp | undefined)?.toDate === 'function'
                ? (message.createdAt as Timestamp).toDate()
                : null;
            const messageCreatedAtLabel =
              messageCreatedAt && !Number.isNaN(messageCreatedAt.getTime())
                ? format(messageCreatedAt, 'p')
                : null;
            const readBy = Array.isArray(message.readBy) ? message.readBy : [message.senderId];
            const isReadByOtherUser = Boolean(otherUserId) && readBy.includes(otherUserId as string);
            const replyInfo = message.replyTo;
            const replyName = replyInfo
              ? (replyInfo.senderId === user?.uid ? 'You' : otherUserProfile?.name || 'Shifter')
              : '';
            const reactionEntries = Object.entries(isDeletedForAll ? {} : (message.reactions || {})).filter(
              ([, users]) => Array.isArray(users) && users.length > 0
            );
            const isActive = activeMessageId === message.id;
            return (
              <div key={message.id} className={cn('flex items-end gap-2', isSender ? 'justify-end' : 'justify-start')}>
                {!isSender && (
                  <Avatar className="chat-row-avatar">
                    <AvatarImage src={getChatAvatarSrc(profile)} className="object-cover" />
                    <AvatarFallback>{getChatAvatarFallback(profile?.name)}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn('chat-message-col', isSender ? 'items-end' : 'items-start', isActive && 'is-active')}
                  onClick={() => {
                    if (activeMessageId === message.id) {
                      setActiveMessageId(null);
                    }
                  }}
                  onTouchStart={(event) => handleTouchStartMessage(message, event)}
                  onTouchMove={handleTouchMoveMessage}
                  onTouchEnd={handleTouchEndMessage}
                >
                  {isActive && !isDeletedForAll ? (
                    <div
                      className={cn('chat-quick-reactions', isSender ? 'is-sender' : 'is-receiver')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {REACTION_SET.map((emoji) => {
                        const reacted = Boolean(user?.uid) && (message.reactions?.[emoji] || []).includes(user.uid);
                        return (
                          <button
                            key={`${message.id}-quick-${emoji}`}
                            type="button"
                            className={cn('chat-quick-reaction', reacted && 'active')}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleToggleReaction(message, emoji);
                              setActiveMessageId(null);
                            }}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className={cn('chat-bubble-wrap', isSender ? 'is-sender' : 'is-receiver')}>
                    <div className={cn('chat-bubble', isSender ? 'me' : 'other')}>
                      {!isDeletedForAll ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="chat-bubble-menu"
                              title="Message options"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={isSender ? 'end' : 'start'} className="w-48">
                            <DropdownMenuItem
                              onClick={() => {
                                handleSetReply(message);
                              }}
                            >
                              <Reply className="mr-2 h-4 w-4" />
                              Reply
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                void handleDeleteForMe(message);
                                setActiveMessageId(null);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete for me
                            </DropdownMenuItem>
                            {isSender ? (
                              <DropdownMenuItem
                                onClick={() => {
                                  void handleDeleteForAll(message);
                                  setActiveMessageId(null);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete for everyone
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                      {replyInfo ? (
                        <div className="chat-reply">
                          <p className="chat-reply-label">{replyName}</p>
                          <p className="chat-reply-text">{replyInfo.text}</p>
                        </div>
                      ) : null}
                      {isImageAttachment ? (
                        <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="chat-image-link">
                          <img
                            src={message.attachmentUrl}
                            alt={message.attachmentName || 'Chat attachment'}
                            className="chat-image-preview"
                            loading="lazy"
                          />
                        </a>
                      ) : null}
                      {!isDeletedForAll && message.attachmentUrl && !isImageAttachment && (
                        <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="chat-attachment-link">
                          {(message.attachmentType || '').startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          <span className="truncate">{message.attachmentName || 'Attachment'}</span>
                        </a>
                      )}
                      {isDeletedForAll ? (
                        <p className="text-sm italic text-muted-foreground">Message deleted</p>
                      ) : (
                        message.text ? <p className="text-sm">{message.text}</p> : null
                      )}
                      {messageCreatedAtLabel ? (
                        <div className={cn('chat-message-meta', isSender ? 'is-sender' : 'is-receiver')}>
                          <span>{messageCreatedAtLabel}</span>
                          {isSender
                            ? <CheckCheck className={cn('chat-read-icon', isReadByOtherUser ? 'is-read' : 'is-sent')} />
                            : null}
                        </div>
                      ) : null}
                    </div>
                    {!isDeletedForAll ? (
                      <button
                        type="button"
                        className="chat-react-trigger"
                        title="React"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveMessageId(message.id);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <Smile className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  {reactionEntries.length > 0 ? (
                    <div className={cn('chat-reactions', isSender ? 'is-sender' : 'is-receiver')}>
                      {reactionEntries.map(([emoji, users]) => {
                        const list = Array.isArray(users) ? users : [];
                        const reacted = Boolean(user?.uid) && list.includes(user.uid);
                        return (
                          <button
                            key={`${message.id}-${emoji}`}
                            type="button"
                            className={cn('chat-reaction-pill', reacted && 'active')}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleToggleReaction(message, emoji);
                            }}
                          >
                            <span className="chat-reaction-emoji">{emoji}</span>
                            <span className="chat-reaction-count">{list.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {isDeletedForAll ? null : null}
                </div>
                {isSender && (
                  <Avatar className="chat-row-avatar">
                    <AvatarImage src={getChatAvatarSrc(profile)} className="object-cover" />
                    <AvatarFallback>{getChatAvatarFallback(profile?.name)}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
          {otherUserIsTyping ? (
            <div className="flex items-end gap-2">
              <Avatar className="chat-row-avatar">
                <AvatarImage src={otherUserProfile.photoURLs?.[0]} className="object-cover" />
                <AvatarFallback>{getChatAvatarFallback(otherUserProfile.name)}</AvatarFallback>
              </Avatar>
              <div className="rounded-2xl border bg-white px-3 py-2 text-sm text-muted-foreground shadow-sm">
                {otherUserProfile.name || 'Este usuario'} está escribiendo...
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-wrap">
          {sendError && <p className="mb-2 text-xs text-destructive">{sendError}</p>}
          {replyTarget ? (
            <div className="chat-reply-preview">
              <div>
                <p className="chat-reply-preview-label">
                  Replying to {replyTarget.senderId === user?.uid ? 'You' : otherUserProfile?.name || 'Shifter'}
                </p>
                <p className="chat-reply-preview-text">{replyTarget.text}</p>
              </div>
              <button type="button" className="chat-reply-preview-close" onClick={() => setReplyTarget(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
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
            <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="chat-emoji-btn" title="Add emoji">
                  <SmilePlus className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="chat-emoji-panel"
                side="top"
                align="start"
                onInteractOutside={(event) => event.preventDefault()}
              >
                <button type="button" className="chat-emoji-close" onClick={() => setEmojiPickerOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
                <emoji-picker ref={emojiPickerRef} className="chat-emoji-picker" />
              </PopoverContent>
            </Popover>
            <Input
              ref={inputRef}
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
            <AvatarFallback>{getChatAvatarFallback(otherUserProfile.name)}</AvatarFallback>
          </Avatar>
          <h4>{otherUserProfile.name}</h4>
          <p>{fullProfiles.other?.location || 'Location unavailable'}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {getVisibleVerificationStatus(fullProfiles.other?.verificationStatus) === 'verified' ? 'Verified' : 'Unverified'}
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
