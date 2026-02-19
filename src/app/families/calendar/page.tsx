'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { Loader2, PlusCircle } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import type { Conversation, Shift } from '@/lib/types';
import { proposeShift, respondToShiftProposal } from '@/app/families/calendar/actions';
import { shiftProposalSchema, type ShiftProposalState } from './schemas';

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
  const [proposalState, proposalAction] = useActionState<ShiftProposalState, FormData>(proposeShift, {
    success: false,
    message: '',
  });

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
    if (proposalState.success) {
      toast({ title: 'Success', description: proposalState.message });
      setModalOpen(false);
      form.reset({
        accepterId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '',
        endTime: '',
      });
      return;
    }
    if (proposalState.message) {
      toast({ variant: 'destructive', title: 'Error', description: proposalState.message });
    }
  }, [proposalState, toast, form]);

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
    return [...shifts]
      .sort((a, b) => {
        const aDate = parseISO(`${a.date}T${a.startTime}`).getTime();
        const bDate = parseISO(`${b.date}T${b.startTime}`).getTime();
        return aDate - bDate;
      })
      .slice(0, 20);
  }, [shifts]);

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
      const result = await respondToShiftProposal(shiftId, response);
      if (result.success) {
        toast({ title: 'Success', description: result.message });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    } finally {
      setRespondingShiftId(null);
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
                <CardDescription>Simple MVP calendar view for upcoming proposals and accepted shifts.</CardDescription>
              </div>
              <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogTrigger asChild>
                  <Button className="calendar-primary-btn">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Propose Shift
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Propose a shift</DialogTitle>
                    <DialogDescription>Create a new proposal using the existing shift flow.</DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form action={proposalAction} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="accepterId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Match</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a match" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {conversationOptions.map((option) => (
                                  <SelectItem key={option.userId} value={option.userId}>
                                    {option.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
              {upcomingShifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shifts scheduled yet.</p>
              ) : (
                upcomingShifts.map((shift) => {
                  const statusLabel = shift.status.replace('_', ' ');
                  const canRespond = shift.status === 'proposed' && shift.accepterId === user?.uid;
                  const isThisUserResponding = respondingShiftId === shift.id;
                  return (
                    <div key={shift.id} className="rounded-xl border p-4 bg-white/70">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{format(parseISO(shift.date), 'EEEE, MMM d')}</p>
                          <p className="text-sm text-muted-foreground">
                            {shift.startTime} - {shift.endTime}
                          </p>
                        </div>
                        <Badge variant="secondary" className="capitalize">
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
