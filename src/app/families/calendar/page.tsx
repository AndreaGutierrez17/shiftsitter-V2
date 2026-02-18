'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, ArrowRightLeft, Loader2, Star } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import type { Shift, Conversation, UserProfile } from '@/lib/types';
import { parseISO, format, isPast } from 'date-fns';
import { AuthGuard } from '@/components/AuthGuard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { proposeShift, respondToShiftProposal, proposeSwap, respondToShiftSwap, submitReview } from '@/app/families/calendar/actions';
import { shiftProposalSchema, type ShiftProposalState, shiftSwapProposalSchema, type ShiftSwapProposalState, reviewSchema, type ReviewState } from './schemas';
import { useActionState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

type ShiftProposalFormValues = z.input<typeof shiftProposalSchema>;
type ShiftSwapFormValues = z.input<typeof shiftSwapProposalSchema>;
type ReviewFormValues = z.input<typeof reviewSchema>;


export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [shiftToSwap, setShiftToSwap] = useState<Shift | null>(null);
  const [shiftToReview, setShiftToReview] = useState<Shift | null>(null);
  const [respondingShiftId, setRespondingShiftId] = useState<string | null>(null);
  const [userProfiles, setUserProfiles] = useState<{[key: string]: UserProfile}>({});
  const { toast } = useToast();

  // --- Form Handling for Shift Proposal ---
  const form = useForm<ShiftProposalFormValues>({
    resolver: zodResolver(shiftProposalSchema),
    defaultValues: {
      accepterId: '',
      date: date ? format(date, 'yyyy-MM-dd') : '',
      startTime: '',
      endTime: '',
    },
  });

  const [proposalState, proposalAction] = useActionState<ShiftProposalState, FormData>(proposeShift, { success: false, message: "" });
  
  // --- Form Handling for Swap Proposal ---
  const swapForm = useForm<ShiftSwapFormValues>({
    resolver: zodResolver(shiftSwapProposalSchema),
    defaultValues: {
      shiftId: '',
      newDate: '',
      newStartTime: '',
      newEndTime: '',
    },
  });
  const [swapProposalState, swapProposalAction] = useActionState<ShiftSwapProposalState, FormData>(proposeSwap, { success: false, message: "" });

  // --- Form Handling for Review ---
  const reviewForm = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
        shiftId: '',
        revieweeId: '',
        rating: 0,
        comment: '',
        kidsSafe: "off",
        punctual: "off",
        cleanAndSafe: "off",
        kidsHappy: "off",
    }
  });

  const [reviewState, reviewAction] = useActionState<ReviewState, FormData>(submitReview, { success: false, message: ""});


  useEffect(() => {
    if (proposalState.success) {
      toast({ title: "Success", description: proposalState.message });
      setIsModalOpen(false);
      form.reset();
    } else if (proposalState.message) {
      toast({ variant: 'destructive', title: "Error", description: proposalState.message });
    }
  }, [proposalState, toast, form]);
  
   useEffect(() => {
    if (date) {
      form.setValue('date', format(date, 'yyyy-MM-dd'));
    }
  }, [date, form]);

  useEffect(() => {
    if (swapProposalState.success) {
      toast({ title: "Success", description: swapProposalState.message });
      setIsSwapModalOpen(false);
      swapForm.reset();
    } else if (swapProposalState.message) {
      toast({ variant: 'destructive', title: "Error", description: swapProposalState.message });
    }
  }, [swapProposalState, toast, swapForm]);

  useEffect(() => {
    if (reviewState.success) {
      toast({ title: "Success", description: reviewState.message });
      setIsReviewModalOpen(false);
      reviewForm.reset();
    } else if (reviewState.message) {
      toast({ variant: 'destructive', title: "Error", description: reviewState.message });
    }
  }, [reviewState, toast, reviewForm]);

  useEffect(() => {
    if (shiftToSwap) {
      swapForm.setValue('shiftId', shiftToSwap.id);
      swapForm.setValue('newDate', shiftToSwap.date);
      swapForm.setValue('newStartTime', shiftToSwap.startTime);
      swapForm.setValue('newEndTime', shiftToSwap.endTime);
    }
  }, [shiftToSwap, swapForm]);
  
  useEffect(() => {
    if (shiftToReview && user) {
        const revieweeId = shiftToReview.userIds.find(id => id !== user.uid);
        reviewForm.setValue('shiftId', shiftToReview.id);
        if (revieweeId) {
            reviewForm.setValue('revieweeId', revieweeId);
        }
    }
  }, [shiftToReview, reviewForm, user]);


  // --- Data Fetching ---
  useEffect(() => {
    if (!user) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);

    const shiftsQuery = query(
      collection(db, 'shifts'),
      where('userIds', 'array-contains', user.uid)
    );
    const convosQuery = query(
        collection(db, 'conversations'),
        where('userIds', 'array-contains', user.uid)
    );

    const unsubscribeShifts = onSnapshot(shiftsQuery, (querySnapshot) => {
      const userShifts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift));
      setShifts(userShifts);
       // Fetch user profiles for display
        const allUserIds = new Set(userShifts.flatMap(s => s.userIds));
        allUserIds.forEach(userId => {
            if (!userProfiles[userId]) {
                const unsub = onSnapshot(doc(db, "users", userId), (doc) => {
                    if (doc.exists()) {
                        setUserProfiles(prev => ({...prev, [userId]: doc.data() as UserProfile}));
                    }
                });
                // This is a simplified approach; in a real app, manage these unsubscribes carefully.
            }
        });
      setLoading(false);
    }, (error) => {
      console.error("Error fetching shifts: ", error);
      setLoading(false);
    });
    
    const unsubscribeConvos = onSnapshot(convosQuery, (querySnapshot) => {
        const userConvos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
        setConversations(userConvos);
    });

    return () => {
      unsubscribeShifts();
      unsubscribeConvos();
      // Also unsubscribe from user profile listeners if managed more robustly
    };
  }, [user, authLoading, userProfiles]);

  // --- Actions ---
  const handleResponse = async (shiftId: string, response: 'accepted' | 'rejected') => {
    setRespondingShiftId(shiftId);
    try {
        const result = await respondToShiftProposal(shiftId, response);
        if (result.success) {
            toast({ title: "Success", description: result.message });
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.message });
        }
    } finally {
        setRespondingShiftId(null);
    }
  };

  const handleSwapResponse = async (shiftId: string, response: 'accepted' | 'rejected') => {
    setRespondingShiftId(shiftId);
    try {
        const result = await respondToShiftSwap(shiftId, response);
        if (result.success) {
            toast({ title: "Success", description: result.message });
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.message });
        }
    } finally {
        setRespondingShiftId(null);
    }
  };


  // --- Derived Data ---
  const shiftDates = shifts.map(s => parseISO(s.date));

  const selectedDayShifts = shifts.filter(shift => 
    date && parseISO(shift.date).toDateString() === date.toDateString()
  );

  const getOtherUser = (conv: Conversation) => {
    if (!user) return null;
    const otherUserId = conv.userIds.find(id => id !== user.uid);
    return otherUserId ? conv.userProfiles[otherUserId] : null;
  }
  
  const getOtherShiftUser = (shift: Shift) => {
      if (!user) return null;
      const otherUserId = shift.userIds.find(id => id !== user.uid);
      return otherUserId ? userProfiles[otherUserId] : null;
  }
  
  const isShiftPast = (shift: Shift) => {
      return isPast(parseISO(`${shift.date}T${shift.endTime}`));
  }

  return (
    <AuthGuard>
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-headline">Your Calendar</CardTitle>
              <CardDescription>Manage your availability and view upcoming shifts.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              {loading || authLoading ? (
                 <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
              ) : (
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  className="rounded-md"
                  modifiers={{
                    hasShift: shiftDates
                  }}
                  modifiersStyles={{
                    hasShift: { 
                        border: '2px solid hsl(var(--primary))', 
                        borderRadius: '9999px',
                    },
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-headline">
                {date ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a date'}
              </CardTitle>
              <CardDescription>Shifts and availability for the selected day.</CardDescription>
            </CardHeader>
            <CardContent>
             <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                    <Button className="w-full mb-6">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Availability / Propose Shift
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Propose a New Shift</DialogTitle>
                        <DialogDescription>
                            Select a match and propose a time for a childcare swap. The selected date is {date ? format(date, 'PPP') : '...'}.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form action={proposalAction} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="accepterId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Propose to</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a match to propose to" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {conversations.map(conv => {
                                                    const otherUser = getOtherUser(conv);
                                                    const otherUserId = conv.userIds.find(id => id !== user?.uid);
                                                    if (!otherUser || !otherUserId) return null;
                                                    return (
                                                        <SelectItem key={otherUserId} value={otherUserId}>
                                                            {otherUser.name}
                                                        </SelectItem>
                                                    )
                                                })}
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
                                        <FormLabel>Start Time</FormLabel>
                                        <FormControl><Input type="time" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="endTime"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>End Time</FormLabel>
                                        <FormControl><Input type="time" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Send Proposal
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
             </Dialog>

              <div className="space-y-4">
                  {selectedDayShifts.length > 0 ? (
                      selectedDayShifts.map(shift => {
                          const otherUser = getOtherShiftUser(shift);
                          const isThisUserResponding = respondingShiftId === shift.id;
                          return (
                          <div key={shift.id} className="p-4 rounded-lg border bg-accent/50">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="font-semibold">{shift.startTime} - {shift.endTime}</p>
                                      <p className="text-sm text-muted-foreground">with {otherUser?.name || '...'}</p>
                                  </div>
                                  <Badge variant={shift.status === 'completed' ? 'secondary' : 'default'} className={
                                    shift.status === 'proposed' ? 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30' : 
                                    shift.status === 'accepted' ? 'bg-green-500/20 text-green-700 border-green-500/30' : 
                                    shift.status === 'rejected' ? 'bg-red-500/20 text-red-700 border-red-500/30' : 
                                    shift.status === 'completed' ? 'bg-gray-500/20 text-gray-700 border-gray-500/30' : 
                                    shift.status === 'swap_proposed' ? 'bg-blue-500/20 text-blue-700 border-blue-500/30' : ''
                                  }>{shift.status.replace('_', ' ')}</Badge>
                              </div>
                               {shift.status === 'swap_proposed' && shift.swapDetails && user?.uid !== shift.swapDetails.proposerId && (
                                  <>
                                      <div className="mt-3 p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
                                          <p className="text-sm font-semibold text-blue-800">Swap Proposed:</p>
                                          <p className="text-sm text-blue-700">
                                              {format(parseISO(shift.swapDetails.newDate), 'PPP')} from {shift.swapDetails.newStartTime} to {shift.swapDetails.newEndTime}
                                          </p>
                                      </div>
                                      <div className="mt-2 grid grid-cols-2 gap-2">
                                          <Button variant="outline" size="sm" onClick={() => handleSwapResponse(shift.id, 'rejected')} disabled={isThisUserResponding}>
                                              {isThisUserResponding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                              Decline Swap
                                          </Button>
                                          <Button size="sm" onClick={() => handleSwapResponse(shift.id, 'accepted')} disabled={isThisUserResponding}>
                                              {isThisUserResponding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                              Accept Swap
                                          </Button>
                                      </div>
                                  </>
                              )}
                              {shift.status === 'swap_proposed' && shift.swapDetails && user?.uid === shift.swapDetails.proposerId && (
                                  <div className="mt-3 p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
                                      <p className="text-sm font-semibold text-blue-800">You proposed a swap. Waiting for response.</p>
                                  </div>
                              )}
                              {shift.status === 'proposed' && shift.accepterId === user?.uid && (
                                  <div className="mt-3 grid grid-cols-2 gap-2">
                                    <Button variant="outline" size="sm" onClick={() => handleResponse(shift.id, 'rejected')} disabled={isThisUserResponding}>
                                        {isThisUserResponding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Decline
                                    </Button>
                                    <Button size="sm" onClick={() => handleResponse(shift.id, 'accepted')} disabled={isThisUserResponding}>
                                        {isThisUserResponding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Accept
                                    </Button>
                                  </div>
                              )}
                              {shift.status === 'accepted' && !isShiftPast(shift) && (
                                  <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => { setShiftToSwap(shift); setIsSwapModalOpen(true); }}>
                                      <ArrowRightLeft className="mr-2 h-4 w-4" /> Propose Swap
                                  </Button>
                              )}
                              {shift.status === 'accepted' && isShiftPast(shift) && (
                                   <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => { setShiftToReview(shift); setIsReviewModalOpen(true); }}>
                                      <Star className="mr-2 h-4 w-4" /> Leave Review
                                  </Button>
                              )}
                          </div>
                      )})
                  ) : (
                      <div className="text-center py-8">
                          <p className="text-muted-foreground">No shifts scheduled for this day.</p>
                      </div>
                  )}
              </div>
            </CardContent>
          </Card>
        </div>
        <Dialog open={isSwapModalOpen} onOpenChange={setIsSwapModalOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Propose a Shift Swap</DialogTitle>
                    <DialogDescription>
                        Propose a new time for your shift on {shiftToSwap ? format(parseISO(shiftToSwap.date), 'PPP') : '...'}.
                    </DialogDescription>
                </DialogHeader>
                <Form {...swapForm}>
                    <form action={swapProposalAction} className="space-y-4">
                        <input type="hidden" {...swapForm.register('shiftId')} />
                        <FormField
                            control={swapForm.control}
                            name="newDate"
                            render={({ field }) => (
                               <FormItem>
                                   <FormLabel>New Date</FormLabel>
                                   <FormControl>
                                        <Input type="date" {...field} />
                                   </FormControl>
                                   <FormMessage />
                               </FormItem>
                            )}
                        />
                         <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={swapForm.control}
                                name="newStartTime"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New Start Time</FormLabel>
                                    <FormControl><Input type="time" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={swapForm.control}
                                name="newEndTime"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New End Time</FormLabel>
                                    <FormControl><Input type="time" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setIsSwapModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={swapForm.formState.isSubmitting}>
                                {swapForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Propose Swap
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
         </Dialog>
         <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Leave a Review</DialogTitle>
                     <DialogDescription>
                        Rate your experience with {shiftToReview ? getOtherShiftUser(shiftToReview)?.name : '...'} for the shift on {shiftToReview ? format(parseISO(shiftToReview.date), 'PPP') : '...'}.
                    </DialogDescription>
                </DialogHeader>
                <Form {...reviewForm}>
                    <form action={reviewAction} className="space-y-6">
                        <input type="hidden" {...reviewForm.register('shiftId')} />
                        <input type="hidden" {...reviewForm.register('revieweeId')} />
                        <FormField
                            control={reviewForm.control}
                            name="rating"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Overall Rating</FormLabel>
                                    <FormControl>
                                        <div className="flex items-center gap-2">
                                            {[1,2,3,4,5].map(star => (
                                                <Star key={star} className={`h-8 w-8 cursor-pointer ${Number(field.value ?? 0) >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} onClick={() => field.onChange(star)} />
                                            ))}
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="space-y-2">
                           <FormLabel>Was the other parent / sitter...</FormLabel>
                           <FormField control={reviewForm.control} name="punctual" render={({field}) => (
                               <FormItem className="flex items-center gap-2 space-y-0">
                                   <FormControl><Checkbox checked={field.value === 'on'} onCheckedChange={checked => field.onChange(checked ? 'on' : 'off')} /></FormControl>
                                   <FormLabel className="font-normal">Punctual?</FormLabel>
                               </FormItem>
                           )} />
                           <FormField control={reviewForm.control} name="kidsHappy" render={({field}) => (
                               <FormItem className="flex items-center gap-2 space-y-0">
                                   <FormControl><Checkbox checked={field.value === 'on'} onCheckedChange={checked => field.onChange(checked ? 'on' : 'off')} /></FormControl>
                                   <FormLabel className="font-normal">Did the kids seem happy?</FormLabel>
                               </FormItem>
                           )} />
                           <FormField control={reviewForm.control} name="cleanAndSafe" render={({field}) => (
                               <FormItem className="flex items-center gap-2 space-y-0">
                                   <FormControl><Checkbox checked={field.value === 'on'} onCheckedChange={checked => field.onChange(checked ? 'on' : 'off')} /></FormControl>
                                   <FormLabel className="font-normal">Was the environment clean and safe?</FormLabel>
                               </FormItem>
                           )} />
                           <FormField control={reviewForm.control} name="kidsSafe" render={({field}) => (
                               <FormItem className="flex items-center gap-2 space-y-0">
                                   <FormControl><Checkbox checked={field.value === 'on'} onCheckedChange={checked => field.onChange(checked ? 'on' : 'off')} /></FormControl>
                                   <FormLabel className="font-normal">Did the children seem safe and well-cared for?</FormLabel>
                               </FormItem>
                           )} />
                        </div>
                        <FormField
                            control={reviewForm.control}
                            name="comment"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Comment (Optional)</FormLabel>
                                    <FormControl><Textarea placeholder="Share more details about your experience..." {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setIsReviewModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={reviewForm.formState.isSubmitting}>
                                {reviewForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Submit Review
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
         </Dialog>
      </div>
    </AuthGuard>
  );
}

