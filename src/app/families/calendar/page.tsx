'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addDoc, collection, deleteField, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { Loader2, PlusCircle, Star } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import type { Conversation, Review, Shift, UserProfile } from '@/lib/types';
import { shiftProposalSchema } from './schemas';
import AppBackButton from '@/components/AppBackButton';
import type { z } from 'zod';

type ShiftFormValues = z.input<typeof shiftProposalSchema>;

const CANCELLATION_CUTOFF_HOURS = 4;
const CANCELLATION_REASON_OPTIONS = [
  { value: 'illness', label: 'Illness' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'schedule_change', label: 'Schedule change' },
  { value: 'transportation_issue', label: 'Transportation issue' },
  { value: 'other', label: 'Other' },
] as const;

type CancelReasonCode = (typeof CANCELLATION_REASON_OPTIONS)[number]['value'];

function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    userIds: Array.from(new Set(conversation.userIds || [])),
  };
}

function normalizeTimeString(time: unknown) {
  if (typeof time !== 'string') return null;
  const trimmed = time.trim();
  if (!trimmed) return null;
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{1}:\d{2}$/.test(trimmed)) return `0${trimmed}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{1}:\d{2}:\d{2}$/.test(trimmed)) return `0${trimmed}`;
  return trimmed;
}

function buildShiftDateTime(date: unknown, time: unknown) {
  if (typeof date !== 'string' || !date) return null;
  const normalizedTime = normalizeTimeString(time);
  if (!normalizedTime) return null;
  const parsed = new Date(`${date}T${normalizedTime}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatShiftDateLabel(date: unknown) {
  const timestampLike = date as { toDate?: () => Date } | null;
  if (timestampLike?.toDate) {
    const parsed = timestampLike.toDate();
    return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : format(parsed, 'EEEE, MMM d');
  }
  if (typeof date !== 'string' || !date) return 'Date unavailable';
  const parsed = parseISO(date);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : format(parsed, 'EEEE, MMM d');
}

const TIME_OPTIONS = Array.from({ length: 18 }, (_, index) => {
  const hour = index + 6;
  return `${String(hour).padStart(2, '0')}:00`;
});

function CalendarPageContent() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [reviewedShiftIds, setReviewedShiftIds] = useState<Set<string>>(new Set());
  const [myReviewsByShiftId, setMyReviewsByShiftId] = useState<Record<string, Review>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [respondingShiftId, setRespondingShiftId] = useState<string | null>(null);
  const [selectedMatchFilterId, setSelectedMatchFilterId] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('');
  const [cancellingShiftId, setCancellingShiftId] = useState<string | null>(null);
  const [cancelTargetShift, setCancelTargetShift] = useState<Shift | null>(null);
  const [cancelReasonCode, setCancelReasonCode] = useState<CancelReasonCode | ''>('');
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTargetShift, setEditTargetShift] = useState<Shift | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [respondingSwapShiftId, setRespondingSwapShiftId] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { rating: number; comment: string }>>({});
  const [submittingReviewShiftId, setSubmittingReviewShiftId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null | undefined>(undefined);
  const [acceptConfirmShift, setAcceptConfirmShift] = useState<Shift | null>(null);
  const autoCompletedShiftIdsRef = useRef<Set<string>>(new Set());
  const focusedShiftId = searchParams.get('shift') || '';
  const todayDate = format(new Date(), 'yyyy-MM-dd');

  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftProposalSchema),
    defaultValues: {
      accepterId: '',
      date: todayDate,
      startTime: '',
      endTime: '',
      numberOfChildren: undefined,
      careLocation: undefined,
      extras: '',
      primaryPhone: '',
      emergencyContact: '',
    },
  });

  const resetProposalForm = () => {
    form.reset({
      accepterId: '',
      date: todayDate,
      startTime: '',
      endTime: '',
      numberOfChildren: undefined,
      careLocation: undefined,
      extras: '',
      primaryPhone: '',
      emergencyContact: '',
    });
  };

  useEffect(() => {
    if (!user) return;
    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      setCurrentUserProfile(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as UserProfile) : null);
    });
    return () => unsubscribeProfile();
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (!authLoading) setLoading(false);
      return;
    }

    setLoading(true);
    const shiftsQuery = query(collection(db, 'shifts'), where('userIds', 'array-contains', user.uid));
    const conversationsQuery = query(collection(db, 'conversations'), where('userIds', 'array-contains', user.uid));
    const reviewsQuery = query(collection(db, 'reviews'), where('reviewerId', '==', user.uid));

    const unsubscribeShifts = onSnapshot(
      shiftsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((row) => ({ id: row.id, ...row.data() } as Shift));
        setShifts(list);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubscribeConversations = onSnapshot(conversationsQuery, (snapshot) => {
      const list = snapshot.docs.map((row) => normalizeConversation({ id: row.id, ...row.data() } as Conversation));
      setConversations(list);
    });

    const unsubscribeReviews = onSnapshot(reviewsQuery, (snapshot) => {
      const reviewed = new Set<string>();
      const byShift: Record<string, Review> = {};
      snapshot.docs.forEach((row) => {
        const data = { id: row.id, ...row.data() } as Review;
        const shiftId = data.shiftId;
        if (typeof shiftId === 'string' && shiftId) {
          reviewed.add(shiftId);
          byShift[shiftId] = data;
        }
      });
      setReviewedShiftIds(reviewed);
      setMyReviewsByShiftId(byShift);
    });

    return () => {
      unsubscribeShifts();
      unsubscribeConversations();
      unsubscribeReviews();
    };
  }, [user, authLoading]);

  const upcomingShifts = useMemo(() => {
    let filtered = selectedMatchFilterId
      ? shifts.filter((shift) => (shift.userIds || []).includes(selectedMatchFilterId))
      : shifts;

    if (selectedStatusFilter) {
      filtered = filtered.filter((shift) => shift.status === selectedStatusFilter);
    }

    const getSortTime = (shift: Shift) => {
      const withTimestamp = (shift as unknown as { startAt?: { toDate?: () => Date } }).startAt;
      if (typeof withTimestamp?.toDate === 'function') {
        const parsed = withTimestamp.toDate();
        return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
      }
      const fallback = buildShiftDateTime(shift.date, shift.startTime);
      return fallback ? fallback.getTime() : Number.POSITIVE_INFINITY;
    };

    return [...filtered]
      .sort((a, b) => getSortTime(a) - getSortTime(b))
      .slice(0, 20);
  }, [shifts, selectedMatchFilterId, selectedStatusFilter]);

  const conversationOptions = useMemo(() => {
    return Array.from(
      conversations.reduce((acc, conv) => {
        const otherUserId = conv.userIds.find((id) => id !== user?.uid);
        const otherUser = otherUserId ? conv.userProfiles?.[otherUserId] : null;
        if (!otherUserId || !otherUser || acc.has(otherUserId)) return acc;
        acc.set(otherUserId, { userId: otherUserId, name: otherUser.name || 'Unknown user' });
        return acc;
      }, new Map<string, { userId: string; name: string }>()).values()
    );
  }, [conversations, user?.uid]);

  const handleAcceptClick = (shift: Shift) => {
    setAcceptConfirmShift(shift);
  };

  const handleRespond = async (shiftId: string, response: 'accepted' | 'rejected') => {
    setRespondingShiftId(shiftId);
    try {
      if (!user) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to respond to a shift.' });
        return;
      }

      const shiftRef = doc(db, 'shifts', shiftId);
      const shiftDoc = await getDoc(shiftRef);
      if (!shiftDoc.exists()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Shift proposal not found.' });
        return;
      }

      const shift = shiftDoc.data() as Shift;
      if (shift.accepterId !== user.uid) {
        toast({ variant: 'destructive', title: 'Error', description: 'You are not authorized to respond to this proposal.' });
        return;
      }
      if (shift.status !== 'proposed') {
        toast({ variant: 'destructive', title: 'Error', description: 'This proposal has already been responded to.' });
        return;
      }

      await updateDoc(shiftRef, { status: response });
      toast({ title: 'Success', description: `Shift proposal ${response}.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error?.message || 'Could not update shift response.' });
    } finally {
      setRespondingShiftId(null);
    }
  };

  const handleProposeShift = async (values: ShiftFormValues) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to propose a shift.' });
      return;
    }

    const validated = shiftProposalSchema.safeParse(values);
    if (!validated.success) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: validated.error.issues[0]?.message || 'Please correct the form.',
      });
      return;
    }

    try {
      const startAt = buildShiftDateTime(validated.data.date, validated.data.startTime);
      const endAt = buildShiftDateTime(validated.data.date, validated.data.endTime);
      if (!startAt || !endAt || endAt.getTime() <= startAt.getTime()) {
        throw new Error('End time must be after the start time.');
      }
      const shiftPayload = {
        proposerId: user.uid,
        accepterId: validated.data.accepterId,
        userIds: [user.uid, validated.data.accepterId],
        date: validated.data.date,
        startTime: validated.data.startTime,
        endTime: validated.data.endTime,
        startAt,
        endAt,
        status: 'proposed',
        createdAt: serverTimestamp(),
        cancellationWindowHours: CANCELLATION_CUTOFF_HOURS,
        ...(typeof validated.data.numberOfChildren === 'number' ? { numberOfChildren: validated.data.numberOfChildren } : {}),
        ...(validated.data.careLocation ? { careLocation: validated.data.careLocation } : {}),
        ...(validated.data.extras?.trim() ? { extras: validated.data.extras.trim().slice(0, 120) } : {}),
        ...(validated.data.primaryPhone?.trim() ? { primaryPhone: validated.data.primaryPhone.trim().slice(0, 40) } : {}),
        ...(validated.data.emergencyContact?.trim() ? { emergencyContact: validated.data.emergencyContact.trim().slice(0, 120) } : {}),
      };
      await addDoc(collection(db, 'shifts'), shiftPayload);

      toast({ title: 'Success', description: 'Shift proposal sent successfully!' });
      setModalOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'An unexpected error occurred while sending the proposal.',
      });
    }
  };

  const selectedMatchName = selectedMatchFilterId
    ? conversationOptions.find((option) => option.userId === selectedMatchFilterId)?.name
    : null;

  const getShiftStartDate = (shift: Shift) => {
    const withTimestamp = (shift as unknown as { startAt?: { toDate?: () => Date } }).startAt;
    if (typeof withTimestamp?.toDate === 'function') return withTimestamp.toDate();
    return buildShiftDateTime(shift.date, shift.startTime);
  };

  const getShiftEndDate = (shift: Shift) => {
    const withTimestamp = (shift as unknown as { endAt?: { toDate?: () => Date } }).endAt;
    if (typeof withTimestamp?.toDate === 'function') return withTimestamp.toDate();
    return buildShiftDateTime(shift.date, shift.endTime);
  };

  const getCancellationReasonLabel = (reasonCode?: Shift['cancelReasonCode']) => {
    const found = CANCELLATION_REASON_OPTIONS.find((option) => option.value === reasonCode);
    return found?.label || 'Other';
  };

  const canCancelShift = (shift: Shift) => {
    if (!user) return { allowed: false, reason: 'You must be logged in.' };
    if (!['proposed', 'accepted'].includes(shift.status)) return { allowed: false, reason: 'Only proposed or accepted shifts can be cancelled.' };
    const startAt = getShiftStartDate(shift);
    if (!startAt) return { allowed: false, reason: 'Shift start time is missing.' };
    const cutoffHours = shift.cancellationWindowHours ?? CANCELLATION_CUTOFF_HOURS;
    if (Date.now() > startAt.getTime() - cutoffHours * 60 * 60 * 1000) {
      return { allowed: false, reason: `You can’t cancel within ${cutoffHours} hours of the start time.` };
    }
    return { allowed: true as const, reason: null };
  };

  const openCancelShiftModal = (shift: Shift) => {
    const eligibility = canCancelShift(shift);
    if (!eligibility.allowed) {
      toast({ variant: 'destructive', title: 'Cannot cancel shift', description: eligibility.reason || 'This shift cannot be cancelled.' });
      return;
    }
    setCancelTargetShift(shift);
    setCancelReasonCode('');
    setCancelReasonText('');
    setCancelModalOpen(true);
  };

  const handleCancelShift = async () => {
    if (!user || !cancelTargetShift) return;
    if (!cancelReasonCode) {
      toast({ variant: 'destructive', title: 'Reason required', description: 'Please select a cancellation reason.' });
      return;
    }

    setCancellingShiftId(cancelTargetShift.id);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/shifts/${cancelTargetShift.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          reasonCode: cancelReasonCode,
          reasonText: cancelReasonText.trim().slice(0, 140),
        }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not cancel shift.');
      }
      toast({ title: 'Shift cancelled', description: 'The other participant will see the cancellation reason in their inbox and calendar.' });
      setCancelModalOpen(false);
      setCancelTargetShift(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not cancel shift', description: error?.message || 'Please try again.' });
    } finally {
      setCancellingShiftId(null);
    }
  };

  const getShiftCounterpart = (shift: Shift) => {
    const otherUserId = (shift.userIds || []).find((id) => id !== user?.uid);
    if (!otherUserId) return { id: null, name: 'Unknown match' };
    const fromConversation = conversationOptions.find((option) => option.userId === otherUserId);
    return { id: otherUserId, name: fromConversation?.name || 'Shifter' };
  };

  const getReviewDraft = (shiftId: string) => reviewDrafts[shiftId] || { rating: 0, comment: '' };
  const setReviewDraft = (shiftId: string, patch: Partial<{ rating: number; comment: string }>) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [shiftId]: {
        rating: patch.rating ?? prev[shiftId]?.rating ?? 0,
        comment: patch.comment ?? prev[shiftId]?.comment ?? '',
      },
    }));
  };

  const renderStars = (value: number, onSelect?: (v: number) => void) => (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, idx) => {
        const starValue = idx + 1;
        const active = starValue <= value;
        const content = (
          <Star
            className={`h-4 w-4 ${active ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`}
          />
        );
        if (!onSelect) return <span key={starValue}>{content}</span>;
        return (
          <button
            key={starValue}
            type="button"
            className="rounded-sm p-0.5"
            onClick={() => onSelect(starValue)}
            aria-label={`Rate ${starValue} star${starValue > 1 ? 's' : ''}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );

  const handleSubmitReview = async (shift: Shift, revieweeUid: string) => {
    if (!user) return;
    const draft = getReviewDraft(shift.id);
    if (draft.rating < 1 || draft.rating > 5) {
      toast({ variant: 'destructive', title: 'Rating required', description: 'Please select a rating from 1 to 5 stars.' });
      return;
    }
    setSubmittingReviewShiftId(shift.id);
    try {
      const endedAt = getShiftEndDate(shift);
      if (shift.status === 'accepted' && endedAt && endedAt.getTime() <= Date.now()) {
        await updateDoc(doc(db, 'shifts', shift.id), {
          status: 'completed',
          completedAt: serverTimestamp(),
        });
      }

      const idToken = await user.getIdToken();
      const response = await fetch(`/api/shifts/${shift.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          rating: draft.rating,
          comment: draft.comment.trim().slice(0, 280),
          revieweeUid,
        }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(payload?.error || 'Could not submit review.');
      toast({ title: 'Review submitted', description: 'Thanks for sharing your experience.' });
      setReviewDrafts((prev) => {
        const next = { ...prev };
        delete next[shift.id];
        return next;
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not submit review', description: error?.message || 'Please try again.' });
    } finally {
      setSubmittingReviewShiftId(null);
    }
  };

  const getShiftStatusBadgeClass = (status: Shift['status']) => {
    switch (status) {
      case 'proposed':
        return 'border-amber-200 bg-amber-50 text-amber-800';
      case 'accepted':
        return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'rejected':
        return 'border-rose-200 bg-rose-50 text-rose-800';
      case 'completed':
        return 'border-slate-200 bg-slate-100 text-slate-700';
      case 'cancelled':
        return 'border-rose-200 bg-rose-50 text-rose-800';
      case 'swap_proposed':
        return 'border-sky-200 bg-sky-50 text-sky-800';
      default:
        return '';
    }
  };

  const canEditShift = (shift: Shift) => {
    if (!user) return { allowed: false, reason: 'You must be logged in.' };
    if (shift.status !== 'accepted') {
      return { allowed: false, reason: 'Only accepted shifts can be changed.' };
    }
    const startAt = getShiftStartDate(shift);
    if (!startAt) return { allowed: false, reason: 'Shift start time is missing.' };
    const cutoffHours = shift.cancellationWindowHours ?? CANCELLATION_CUTOFF_HOURS;
    if (Date.now() > startAt.getTime() - cutoffHours * 60 * 60 * 1000) {
      return { allowed: false, reason: `You can’t request a new date within ${cutoffHours} hours of the start time.` };
    }
    return { allowed: true as const, reason: null };
  };

  const openEditShiftModal = (shift: Shift) => {
    const eligibility = canEditShift(shift);
    if (!eligibility.allowed) {
      toast({ variant: 'destructive', title: 'Cannot edit shift', description: eligibility.reason || 'This shift cannot be changed.' });
      return;
    }
    setEditTargetShift(shift);
    setEditDate(shift.date);
    setEditStartTime(shift.startTime);
    setEditEndTime(shift.endTime);
    setEditModalOpen(true);
  };

  const handleRequestShiftChange = async () => {
    if (!user || !editTargetShift) return;
    if (!editDate || !editStartTime || !editEndTime) {
      toast({ variant: 'destructive', title: 'Missing details', description: 'Date, start, and end time are required.' });
      return;
    }

    const nextStartAt = buildShiftDateTime(editDate, editStartTime);
    const nextEndAt = buildShiftDateTime(editDate, editEndTime);
    if (!nextStartAt || !nextEndAt || nextEndAt.getTime() <= nextStartAt.getTime()) {
      toast({ variant: 'destructive', title: 'Invalid time range', description: 'End time must be after the start time.' });
      return;
    }

    setEditingShiftId(editTargetShift.id);
    try {
      await updateDoc(doc(db, 'shifts', editTargetShift.id), {
        status: 'swap_proposed',
        swapDetails: {
          proposerId: user.uid,
          newDate: editDate,
          newStartTime: editStartTime,
          newEndTime: editEndTime,
        },
      });
      toast({ title: 'Change request sent', description: 'The other participant can now accept or reject the new schedule.' });
      setEditModalOpen(false);
      setEditTargetShift(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not request change', description: error?.message || 'Please try again.' });
    } finally {
      setEditingShiftId(null);
    }
  };

  const handleRespondToShiftChange = async (shift: Shift, response: 'accepted' | 'rejected') => {
    if (!user) return;
    const swapDetails = shift.swapDetails;
    if (!swapDetails) {
      toast({ variant: 'destructive', title: 'Missing change request', description: 'There is no pending date change for this shift.' });
      return;
    }
    if (swapDetails.proposerId === user.uid) {
      toast({ variant: 'destructive', title: 'Action not allowed', description: 'You cannot respond to your own date change request.' });
      return;
    }

    setRespondingSwapShiftId(shift.id);
    try {
      if (response === 'accepted') {
        const nextStartAt = buildShiftDateTime(swapDetails.newDate, swapDetails.newStartTime);
        const nextEndAt = buildShiftDateTime(swapDetails.newDate, swapDetails.newEndTime);
        if (!nextStartAt || !nextEndAt || nextEndAt.getTime() <= nextStartAt.getTime()) {
          throw new Error('The requested new date/time is invalid.');
        }

        await updateDoc(doc(db, 'shifts', shift.id), {
          status: 'accepted',
          date: swapDetails.newDate,
          startTime: swapDetails.newStartTime,
          endTime: swapDetails.newEndTime,
          startAt: nextStartAt,
          endAt: nextEndAt,
          completedAt: deleteField(),
          startReminderSent: false,
          startReminderSentAt: deleteField(),
          swapDetails: deleteField(),
        });
      } else {
        await updateDoc(doc(db, 'shifts', shift.id), {
          status: 'accepted',
          swapDetails: deleteField(),
        });
      }

      toast({
        title: response === 'accepted' ? 'Change accepted' : 'Change declined',
        description: response === 'accepted'
          ? 'The new date/time has been applied.'
          : 'The shift kept its original date/time.',
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not update request', description: error?.message || 'Please try again.' });
    } finally {
      setRespondingSwapShiftId(null);
    }
  };
  const canAccessSecureCalendar = true;

  useEffect(() => {
    if (!user || !canAccessSecureCalendar || shifts.length === 0) return;

    const now = Date.now();
    const staleAcceptedShifts = shifts.filter((shift) => {
      if (shift.status !== 'accepted') return false;
      if (autoCompletedShiftIdsRef.current.has(shift.id)) return false;
      const endAt = getShiftEndDate(shift);
      return !!endAt && endAt.getTime() <= now;
    });

    if (staleAcceptedShifts.length === 0) return;

    staleAcceptedShifts.forEach((shift) => {
      autoCompletedShiftIdsRef.current.add(shift.id);
      updateDoc(doc(db, 'shifts', shift.id), {
        status: 'completed',
        completedAt: serverTimestamp(),
      }).catch((error) => {
        console.error('Could not auto-complete shift:', error);
        autoCompletedShiftIdsRef.current.delete(shift.id);
      });
    });
  }, [shifts, user, canAccessSecureCalendar]);

  if (loading || authLoading) {
    return (
      <div className="ss-page-shell">
        <div className="ss-page-inner">
          <Card className="ss-soft-card">
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="ss-page-shell">
        <div className="ss-page-inner max-w-4xl">
            <Card className="ss-soft-card" data-tour="calendar-center">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                <AppBackButton fallbackHref="/families" label="Back" className="mb-3" />
                <CardTitle className="font-headline text-3xl">Shifts</CardTitle>
                <CardDescription>
                  {selectedMatchName
                    ? `Showing shifts with ${selectedMatchName}.`
                    : 'Request, review, and manage shift proposals with your shifters.'}
                </CardDescription>
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  ShiftSitter facilitates connections between families but is not responsible for childcare agreements.
                </p>
              </div>
              <Button
                className="calendar-primary-btn"
                disabled={!canAccessSecureCalendar}
                onClick={() => setModalOpen(true)}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Propose Shift
              </Button>
              <Dialog
                open={modalOpen}
                onOpenChange={(open) => {
                  setModalOpen(open);
                  if (!open) resetProposalForm();
                }}
              >
                <DialogContent className="border shadow-lg">
                  <DialogHeader>
                    <DialogTitle>Propose a shift</DialogTitle>
                    <DialogDescription>Create a new proposal using the existing shift flow.</DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleProposeShift)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="accepterId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Shifter</FormLabel>
                            <FormControl>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={field.value}
                                onChange={(e) => field.onChange(e.target.value)}
                              >
                                <option value="">Select a shifter</option>
                                {conversationOptions.map((option) => (
                                  <option key={option.userId} value={option.userId}>
                                    {option.name}
                                  </option>
                                ))}
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date</FormLabel>
                            <FormControl>
                              <Input type="date" min={todayDate} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="startTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Start time</FormLabel>
                              <FormControl>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={field.value}
                                  onChange={(e) => field.onChange(e.target.value)}
                                >
                                  <option value="">Select start time</option>
                                  {TIME_OPTIONS.map((time) => (
                                    <option key={`start-${time}`} value={time}>
                                      {time}
                                    </option>
                                  ))}
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="endTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>End time</FormLabel>
                              <FormControl>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={field.value}
                                  onChange={(e) => field.onChange(e.target.value)}
                                >
                                  <option value="">Select end time</option>
                                  {TIME_OPTIONS.map((time) => (
                                    <option key={`end-${time}`} value={time}>
                                      {time}
                                    </option>
                                  ))}
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="numberOfChildren"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Number of children</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  value={typeof field.value === 'number' ? field.value : ''}
                                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="careLocation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Care location</FormLabel>
                              <FormControl>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={field.value ?? ''}
                                  onChange={(e) => field.onChange(e.target.value || undefined)}
                                >
                                  <option value="">Select location</option>
                                  <option value="my_home">My home</option>
                                  <option value="their_home">Their home</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="extras"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Extras</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ''} maxLength={120} placeholder="Meals, bedtime routine, school drop-off..." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="primaryPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Primary phone (optional)</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ''} maxLength={40} placeholder="555-123-4567" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="emergencyContact"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Emergency contact (optional)</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ''} maxLength={120} placeholder="Name and phone" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                          {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Send proposal
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
              <Dialog
                open={cancelModalOpen}
                onOpenChange={(open) => {
                  setCancelModalOpen(open);
                  if (!open) {
                    setCancelTargetShift(null);
                    setCancelReasonCode('');
                    setCancelReasonText('');
                  }
                }}
              >
                <DialogContent className="border shadow-lg">
                  <DialogHeader>
                    <DialogTitle>Cancel shift</DialogTitle>
                    <DialogDescription>
                      Select a reason. The other participant will receive the reason in their notifications and calendar view.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Reason *</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={cancelReasonCode}
                        onChange={(e) => setCancelReasonCode(e.target.value as CancelReasonCode | '')}
                      >
                        <option value="">Select a reason</option>
                        {CANCELLATION_REASON_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Additional details (optional)</label>
                      <Textarea
                        value={cancelReasonText}
                        onChange={(e) => setCancelReasonText(e.target.value.slice(0, 140))}
                        maxLength={140}
                        placeholder="Short note for the other participant (max 140 chars)"
                      />
                      <p className="mt-1 text-right text-xs text-muted-foreground">{cancelReasonText.length}/140</p>
                    </div>
                    {cancelTargetShift ? (
                      <p className="text-xs text-muted-foreground">
                        Cutoff: cancellations are blocked within {cancelTargetShift.cancellationWindowHours ?? CANCELLATION_CUTOFF_HOURS} hours of the start time.
                      </p>
                    ) : null}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setCancelModalOpen(false)}>
                      Keep shift
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={!cancelReasonCode || cancellingShiftId === cancelTargetShift?.id}
                      onClick={handleCancelShift}
                    >
                      {cancellingShiftId === cancelTargetShift?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Confirm cancellation
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog
                open={editModalOpen}
                onOpenChange={(open) => {
                  setEditModalOpen(open);
                  if (!open) {
                    setEditTargetShift(null);
                    setEditDate('');
                    setEditStartTime('');
                    setEditEndTime('');
                  }
                }}
              >
                <DialogContent className="border shadow-lg">
                  <DialogHeader>
                    <DialogTitle>Request a new date</DialogTitle>
                    <DialogDescription>
                      Send a date/time change request. The other participant must accept it before the shift changes.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">New date</label>
                      <Input type="date" min={todayDate} value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">New start</label>
                        <Input
                          type="time"
                          value={editStartTime}
                          onChange={(e) => setEditStartTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">New end</label>
                        <Input
                          type="time"
                          value={editEndTime}
                          onChange={(e) => setEditEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setEditModalOpen(false)}>
                      Keep current shift
                    </Button>
                    <Button
                      type="button"
                      onClick={handleRequestShiftChange}
                      disabled={!editDate || !editStartTime || !editEndTime || editingShiftId === editTargetShift?.id}
                    >
                      {editingShiftId === editTargetShift?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Send change request
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-3">
              {!canAccessSecureCalendar ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-medium">Calendar access is currently unavailable for this account.</p>
                  <Button className="mt-3" size="sm" onClick={() => window.location.assign('/families/profile/edit')}>
                    Go to Profile Edit
                  </Button>
                </div>
              ) : null}
              <div className="rounded-xl border border-border/80 bg-white p-3 shadow-sm">
                <label className="mb-2 block text-sm font-medium text-foreground">Filter by shifter</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedMatchFilterId}
                  onChange={(e) => setSelectedMatchFilterId(e.target.value)}
                  disabled={!canAccessSecureCalendar}
                >
                  <option value="">All shifters</option>
                  {conversationOptions.map((option) => (
                    <option key={`filter-${option.userId}`} value={option.userId}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-border/80 bg-white p-3 shadow-sm">
                <label className="mb-2 block text-sm font-medium text-foreground">Filter by status</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value)}
                  disabled={!canAccessSecureCalendar}
                >
                  <option value="">All statuses</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              {!canAccessSecureCalendar ? null : upcomingShifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {selectedMatchFilterId ? 'No shifts found for the selected shifter yet.' : 'No shifts scheduled yet.'}
                </p>
              ) : (
                upcomingShifts.map((shift) => {
                  const statusLabel =
                    typeof shift.status === 'string'
                      ? shift.status.replace('_', ' ')
                      : 'status unavailable';
                  const canRespond = shift.status === 'proposed' && shift.accepterId === user?.uid;
                  const isThisUserResponding = respondingShiftId === shift.id;
                  const counterpart = getShiftCounterpart(shift);
                  const proposerLabel = shift.proposerId === user?.uid ? 'You' : counterpart.name;
                  const shiftEnded = (() => {
                    const endAt = getShiftEndDate(shift);
                    return !!endAt && endAt.getTime() <= Date.now();
                  })();
                  const isReviewEligible = shift.status === 'completed' || (shift.status === 'accepted' && shiftEnded);
                  const canLeaveReview = isReviewEligible && !reviewedShiftIds.has(shift.id);
                  const existingReview = myReviewsByShiftId[shift.id];
                  const reviewDraft = getReviewDraft(shift.id);
                  const cancelledByLabel = shift.cancelledByUid
                    ? (shift.cancelledByUid === user?.uid ? 'You' : counterpart.name)
                    : null;
                  const cancellationEligibility = canCancelShift(shift);
                  const canShowCancelAction = ['proposed', 'accepted'].includes(shift.status);
                  const editEligibility = canEditShift(shift);
                  const canRespondToSwap = shift.status === 'swap_proposed' && shift.swapDetails?.proposerId !== user?.uid;
                  const isWaitingOnSwapResponse = shift.status === 'swap_proposed' && shift.swapDetails?.proposerId === user?.uid;
                  const isFocusedShift = focusedShiftId === shift.id;
                  return (
                    <div
                      key={shift.id}
                      className={`rounded-xl border bg-white p-4 shadow-sm ${isFocusedShift ? 'border-primary ring-2 ring-primary/20' : 'border-border/90'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{formatShiftDateLabel(shift.date)}</p>
                          <p className="text-sm text-muted-foreground">
                            {shift.startTime} - {shift.endTime}
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            With <span className="font-medium">{counterpart.name}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Proposed by {proposerLabel}
                          </p>
                        </div>
                        <Badge variant="secondary" className={`capitalize border ${getShiftStatusBadgeClass(shift.status)}`}>
                          {statusLabel}
                        </Badge>
                      </div>
                      {canRespond ? (
                        <div className="mt-3 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isThisUserResponding}
                            onClick={() => void handleAcceptClick(shift)}
                          >
                            {isThisUserResponding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Accept
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isThisUserResponding}
                            onClick={() => handleRespond(shift.id, 'rejected')}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                      {canShowCancelAction ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!cancellationEligibility.allowed || cancellingShiftId === shift.id}
                            onClick={() => openCancelShiftModal(shift)}
                          >
                            {cancellingShiftId === shift.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Cancel shift
                          </Button>
                          {!cancellationEligibility.allowed && shift.status !== 'cancelled' ? (
                            <p className="text-xs text-muted-foreground">{cancellationEligibility.reason}</p>
                          ) : null}
                        </div>
                      ) : null}
                      {shift.status === 'accepted' ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!editEligibility.allowed || editingShiftId === shift.id}
                            onClick={() => openEditShiftModal(shift)}
                          >
                            {editingShiftId === shift.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Request new date
                          </Button>
                          {!editEligibility.allowed ? (
                            <p className="text-xs text-muted-foreground">{editEligibility.reason}</p>
                          ) : null}
                        </div>
                      ) : null}
                      {shift.status === 'accepted' && (shift.numberOfChildren || shift.careLocation || shift.extras) ? (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900">
                          <p className="font-medium">Shift details</p>
                          <div className="mt-2 space-y-1 text-sm text-slate-700">
                            {typeof shift.numberOfChildren === 'number' ? <p>Children: {shift.numberOfChildren}</p> : null}
                            {shift.careLocation ? <p>Care location: {shift.careLocation === 'my_home' ? 'My home' : 'Their home'}</p> : null}
                            {shift.extras ? <p>Extras: {shift.extras}</p> : null}
                          </div>
                        </div>
                      ) : null}
                      {shift.status === 'accepted' && (shift.primaryPhone || shift.emergencyContact) ? (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                          <p className="font-medium">Accepted shift contacts</p>
                          {shift.primaryPhone ? <p className="mt-1">Primary phone: {shift.primaryPhone}</p> : null}
                          {shift.emergencyContact ? <p className="mt-1">Emergency contact: {shift.emergencyContact}</p> : null}
                        </div>
                      ) : null}
                      {shift.status === 'swap_proposed' && shift.swapDetails ? (
                        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                          <p className="font-medium">
                            Requested change: {formatShiftDateLabel(shift.swapDetails.newDate)} from {shift.swapDetails.newStartTime} to {shift.swapDetails.newEndTime}
                          </p>
                          {isWaitingOnSwapResponse ? (
                            <p className="mt-1 text-xs text-sky-800/80">Waiting for {counterpart.name} to accept or reject your request.</p>
                          ) : null}
                          {canRespondToSwap ? (
                            <div className="mt-3 flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={respondingSwapShiftId === shift.id}
                                onClick={() => handleRespondToShiftChange(shift, 'accepted')}
                              >
                                {respondingSwapShiftId === shift.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Accept change
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={respondingSwapShiftId === shift.id}
                                onClick={() => handleRespondToShiftChange(shift, 'rejected')}
                              >
                                Decline change
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {shift.status === 'cancelled' ? (
                        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                          <p className="font-medium">
                            Cancelled by {cancelledByLabel || 'a participant'}
                          </p>
                          <p className="mt-1">
                            Reason: {getCancellationReasonLabel(shift.cancelReasonCode)}
                            {shift.cancelReasonText ? ` — ${shift.cancelReasonText}` : ''}
                          </p>
                        </div>
                      ) : null}
                      {canLeaveReview ? (
                        <div className="mt-3 rounded-lg border border-primary/20 bg-accent/40 p-3">
                          <p className="text-sm font-medium text-foreground">Leave a review</p>
                          <p className="text-xs text-muted-foreground">Rate your experience with {counterpart.name}. Reviews cannot be edited.</p>
                          <div className="mt-2">
                            {renderStars(reviewDraft.rating, (value) => setReviewDraft(shift.id, { rating: value }))}
                          </div>
                          <Textarea
                            className="mt-2"
                            placeholder="Optional comment (max 280 chars)"
                            value={reviewDraft.comment}
                            maxLength={280}
                            onChange={(e) => setReviewDraft(shift.id, { comment: e.target.value.slice(0, 280) })}
                          />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">{reviewDraft.comment.length}/280</p>
                            <Button
                              type="button"
                              size="sm"
                              disabled={submittingReviewShiftId === shift.id || reviewDraft.rating < 1}
                              onClick={() => counterpart.id && handleSubmitReview(shift, counterpart.id)}
                            >
                              {submittingReviewShiftId === shift.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              Submit review
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {isReviewEligible && existingReview ? (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-sm font-medium text-emerald-900">Thanks, you already reviewed this shift.</p>
                          <div className="mt-1">{renderStars(existingReview.rating)}</div>
                          {existingReview.comment ? (
                            <p className="mt-2 text-sm text-emerald-900/90">{existingReview.comment}</p>
                          ) : (
                            <p className="mt-2 text-xs text-emerald-800/80">No comment provided.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
          <Dialog open={Boolean(acceptConfirmShift)} onOpenChange={(open) => !open && setAcceptConfirmShift(null)}>
            <DialogContent className="border shadow-lg">
              <DialogHeader>
                <DialogTitle>Accept this shift?</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>By accepting this shift, you agree to communicate clearly and provide appropriate care based on the details agreed between both parties.</p>
                    <p>ShiftSitter facilitates connections between users but does not supervise, verify, or take responsibility for individual care arrangements.</p>
                    <p>Please ensure you are comfortable with your match and take appropriate steps to confirm identity, safety, and expectations.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAcceptConfirmShift(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!acceptConfirmShift || respondingShiftId === acceptConfirmShift.id}
                  onClick={() => {
                    if (!acceptConfirmShift) return;
                    void handleRespond(acceptConfirmShift.id, 'accepted');
                    setAcceptConfirmShift(null);
                  }}
                >
                  {acceptConfirmShift && respondingShiftId === acceptConfirmShift.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirm accept
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AuthGuard>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background px-4 py-10">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading calendar...
            </div>
          </div>
        </div>
      }
    >
      <CalendarPageContent />
    </Suspense>
  );
}
