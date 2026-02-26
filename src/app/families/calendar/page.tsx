'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { Loader2, PlusCircle, Star } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import type { Conversation, Review, Shift } from '@/lib/types';
import { shiftProposalSchema } from './schemas';

type ShiftFormValues = {
  accepterId: string;
  date: string;
  startTime: string;
  endTime: string;
};

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

export default function CalendarPage() {
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
  const [cancellingShiftId, setCancellingShiftId] = useState<string | null>(null);
  const [cancelTargetShift, setCancelTargetShift] = useState<Shift | null>(null);
  const [cancelReasonCode, setCancelReasonCode] = useState<CancelReasonCode | ''>('');
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { rating: number; comment: string }>>({});
  const [submittingReviewShiftId, setSubmittingReviewShiftId] = useState<string | null>(null);

  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftProposalSchema),
    defaultValues: {
      accepterId: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: '',
      endTime: '',
    },
  });

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
    const filtered = selectedMatchFilterId
      ? shifts.filter((shift) => (shift.userIds || []).includes(selectedMatchFilterId))
      : shifts;

    return [...filtered]
      .sort((a, b) => {
        const aDate = parseISO(`${a.date}T${a.startTime}`).getTime();
        const bDate = parseISO(`${b.date}T${b.startTime}`).getTime();
        return aDate - bDate;
      })
      .slice(0, 20);
  }, [shifts, selectedMatchFilterId]);

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
      const startAt = new Date(`${validated.data.date}T${validated.data.startTime}:00`);
      const endAt = new Date(`${validated.data.date}T${validated.data.endTime}:00`);
      await addDoc(collection(db, 'shifts'), {
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
      });

      toast({ title: 'Success', description: 'Shift proposal sent successfully!' });
      setModalOpen(false);
      form.reset({
        accepterId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '',
        endTime: '',
      });
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
    const withTimestamp = shift.startAt as unknown as { toDate?: () => Date } | undefined;
    if (typeof withTimestamp?.toDate === 'function') return withTimestamp.toDate();
    const parsed = new Date(`${shift.date}T${shift.startTime}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    return { id: otherUserId, name: fromConversation?.name || 'Match' };
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

  return (
    <AuthGuard>
      <div className="ss-page-shell">
        <div className="ss-page-inner max-w-4xl">
          <Card className="ss-soft-card">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="font-headline text-3xl">Upcoming Shifts</CardTitle>
                <CardDescription>
                  {selectedMatchName
                    ? `Showing shifts with ${selectedMatchName}.`
                    : 'Simple MVP calendar view for upcoming proposals and accepted shifts.'}
                </CardDescription>
              </div>
              <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogTrigger asChild>
                  <Button className="calendar-primary-btn">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Propose Shift
                  </Button>
                </DialogTrigger>
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
                            <FormLabel>Match</FormLabel>
                            <FormControl>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={field.value}
                                onChange={(e) => {
                                  field.onChange(e.target.value);
                                  setSelectedMatchFilterId(e.target.value);
                                }}
                              >
                                <option value="">Select a match</option>
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
                              <Input type="date" {...field} />
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
                              <FormLabel>Start</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} />
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
                              <FormLabel>End</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} />
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
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/80 bg-white p-3 shadow-sm">
                <label className="mb-2 block text-sm font-medium text-foreground">Filter by match</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedMatchFilterId}
                  onChange={(e) => setSelectedMatchFilterId(e.target.value)}
                >
                  <option value="">All matches</option>
                  {conversationOptions.map((option) => (
                    <option key={`filter-${option.userId}`} value={option.userId}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              {upcomingShifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {selectedMatchFilterId ? 'No shifts found for the selected match yet.' : 'No shifts scheduled yet.'}
                </p>
              ) : (
                upcomingShifts.map((shift) => {
                  const statusLabel = shift.status.replace('_', ' ');
                  const canRespond = shift.status === 'proposed' && shift.accepterId === user?.uid;
                  const isThisUserResponding = respondingShiftId === shift.id;
                  const counterpart = getShiftCounterpart(shift);
                  const proposerLabel = shift.proposerId === user?.uid ? 'You' : counterpart.name;
                  const canLeaveReview = shift.status === 'completed' && !reviewedShiftIds.has(shift.id);
                  const existingReview = myReviewsByShiftId[shift.id];
                  const reviewDraft = getReviewDraft(shift.id);
                  const cancelledByLabel = shift.cancelledByUid
                    ? (shift.cancelledByUid === user?.uid ? 'You' : counterpart.name)
                    : null;
                  const cancellationEligibility = canCancelShift(shift);
                  const canShowCancelAction = ['proposed', 'accepted'].includes(shift.status);
                  return (
                    <div key={shift.id} className="rounded-xl border border-border/90 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{format(parseISO(shift.date), 'EEEE, MMM d')}</p>
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
                            onClick={() => handleRespond(shift.id, 'accepted')}
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
                      {shift.status === 'completed' && existingReview ? (
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
        </div>
      </div>
    </AuthGuard>
  );
}
