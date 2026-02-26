'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { Loader2, PlusCircle } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import type { Conversation, Shift } from '@/lib/types';
import { shiftProposalSchema } from './schemas';

type ShiftFormValues = {
  accepterId: string;
  date: string;
  startTime: string;
  endTime: string;
};

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
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [respondingShiftId, setRespondingShiftId] = useState<string | null>(null);
  const [selectedMatchFilterId, setSelectedMatchFilterId] = useState<string>('');

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

    return () => {
      unsubscribeShifts();
      unsubscribeConversations();
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
      await addDoc(collection(db, 'shifts'), {
        proposerId: user.uid,
        accepterId: validated.data.accepterId,
        userIds: [user.uid, validated.data.accepterId],
        date: validated.data.date,
        startTime: validated.data.startTime,
        endTime: validated.data.endTime,
        status: 'proposed',
        createdAt: serverTimestamp(),
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
                  return (
                    <div key={shift.id} className="rounded-xl border border-border/90 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{format(parseISO(shift.date), 'EEEE, MMM d')}</p>
                          <p className="text-sm text-muted-foreground">
                            {shift.startTime} - {shift.endTime}
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
