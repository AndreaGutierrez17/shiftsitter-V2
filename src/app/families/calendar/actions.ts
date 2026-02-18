'use server';

import { auth, db } from '@/lib/firebase/client';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import { shiftProposalSchema, shiftSwapProposalSchema, reviewSchema } from './schemas';
import type { ShiftProposalState, ShiftSwapProposalState, ReviewState } from './schemas';


export async function proposeShift(prevState: ShiftProposalState, formData: FormData): Promise<ShiftProposalState> {
  const proposer = auth.currentUser;
  if (!proposer) {
    return {
      success: false,
      message: 'You must be logged in to propose a shift.',
    };
  }

  const validatedFields = shiftProposalSchema.safeParse({
    accepterId: formData.get('accepterId'),
    date: formData.get('date'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });

  if (!validatedFields.success) {
    const firstError = validatedFields.error.issues[0]?.message;
    return {
      message: firstError || "Please correct the errors in the form.",
      success: false,
    };
  }
  
  const { accepterId, date, startTime, endTime } = validatedFields.data;

  try {
    await addDoc(collection(db, 'shifts'), {
      proposerId: proposer.uid,
      accepterId: accepterId,
      userIds: [proposer.uid, accepterId],
      date: date,
      startTime: startTime,
      endTime: endTime,
      status: 'proposed',
      createdAt: serverTimestamp(),
    });

    revalidatePath('/families/calendar');
    return {
      success: true,
      message: 'Shift proposal sent successfully!',
    };

  } catch (error) {
    console.error("Error proposing shift:", error);
    return {
      message: 'An unexpected error occurred while sending the proposal. Please try again.',
      success: false,
    };
  }
}


export async function respondToShiftProposal(
  shiftId: string,
  response: 'accepted' | 'rejected'
): Promise<{ success: boolean; message: string }> {
  const user = auth.currentUser;
  if (!user) {
    return {
      success: false,
      message: 'You must be logged in to respond to a shift.',
    };
  }

  try {
    const shiftRef = doc(db, 'shifts', shiftId);
    const shiftDoc = await getDoc(shiftRef);

    if (!shiftDoc.exists()) {
      throw new Error('Shift proposal not found.');
    }

    const shift = shiftDoc.data();
    if (shift.accepterId !== user.uid) {
      return {
        success: false,
        message: 'You are not authorized to respond to this proposal.',
      };
    }

    if (shift.status !== 'proposed') {
        return {
            success: false,
            message: 'This proposal has already been responded to.'
        }
    }

    await updateDoc(shiftRef, { status: response });

    revalidatePath('/families/calendar');

    return {
      success: true,
      message: `Shift proposal ${response}.`,
    };
  } catch (error) {
    console.error('Error responding to shift proposal:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return {
      success: false,
      message,
    };
  }
}


export async function proposeSwap(prevState: ShiftSwapProposalState, formData: FormData): Promise<ShiftSwapProposalState> {
  const user = auth.currentUser;
  if (!user) {
    return {
      success: false,
      message: 'You must be logged in to propose a swap.',
    };
  }

  const validatedFields = shiftSwapProposalSchema.safeParse({
    shiftId: formData.get('shiftId'),
    newDate: formData.get('newDate'),
    newStartTime: formData.get('newStartTime'),
    newEndTime: formData.get('newEndTime'),
  });

  if (!validatedFields.success) {
    const firstError = validatedFields.error.issues[0]?.message;
    return {
      message: firstError || "Please correct the errors in the form.",
      success: false,
    };
  }
  
  const { shiftId, newDate, newStartTime, newEndTime } = validatedFields.data;

  try {
    const shiftRef = doc(db, 'shifts', shiftId);
    const shiftDoc = await getDoc(shiftRef);

    if (!shiftDoc.exists()) {
        throw new Error('Shift not found.');
    }
    
    const shift = shiftDoc.data();
    if (!shift.userIds.includes(user.uid)) {
      return { success: false, message: 'You are not part of this shift.' };
    }
    if (shift.status !== 'accepted') {
        return { success: false, message: 'Only accepted shifts can be swapped.' };
    }

    await updateDoc(shiftRef, {
      status: 'swap_proposed',
      swapDetails: {
        proposerId: user.uid,
        newDate,
        newStartTime,
        newEndTime,
      }
    });

    revalidatePath('/families/calendar');
    return {
      success: true,
      message: 'Shift swap proposal sent!',
    };

  } catch (error) {
    console.error("Error proposing swap:", error);
    return {
      message: 'An unexpected error occurred while proposing the swap.',
      success: false,
    };
  }
}


export async function respondToShiftSwap(
  shiftId: string,
  response: 'accepted' | 'rejected'
): Promise<{ success: boolean; message: string }> {
  const user = auth.currentUser;
  if (!user) {
    return { success: false, message: 'You must be logged in.' };
  }

  try {
    const shiftRef = doc(db, 'shifts', shiftId);
    const shiftDoc = await getDoc(shiftRef);

    if (!shiftDoc.exists()) {
      throw new Error('Shift not found.');
    }

    const shift = shiftDoc.data();
    if (shift.status !== 'swap_proposed') {
        return { success: false, message: 'This shift is not pending a swap.' };
    }
    if (shift.swapDetails.proposerId === user.uid) {
      return { success: false, message: 'You cannot respond to your own swap proposal.'};
    }
    if (!shift.userIds.includes(user.uid)) {
        return { success: false, message: 'You are not part of this shift.' };
    }
    
    if (response === 'accepted') {
        await updateDoc(shiftRef, {
            status: 'accepted',
            date: shift.swapDetails.newDate,
            startTime: shift.swapDetails.newStartTime,
            endTime: shift.swapDetails.newEndTime,
            swapDetails: deleteField(),
        });
    } else { // rejected
        await updateDoc(shiftRef, {
            status: 'accepted', 
            swapDetails: deleteField(),
        });
    }

    revalidatePath('/families/calendar');
    return { success: true, message: `Swap proposal ${response}.` };

  } catch (error) {
    console.error('Error responding to shift swap:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { success: false, message };
  }
}

export async function submitReview(prevState: ReviewState, formData: FormData): Promise<ReviewState> {
    const user = auth.currentUser;
    if (!user) {
        return { success: false, message: 'You must be logged in.' };
    }

    const validatedFields = reviewSchema.safeParse({
        shiftId: formData.get('shiftId'),
        revieweeId: formData.get('revieweeId'),
        rating: formData.get('rating'),
        comment: formData.get('comment'),
        kidsSafe: formData.get('kidsSafe'),
        punctual: formData.get('punctual'),
        cleanAndSafe: formData.get('cleanAndSafe'),
        kidsHappy: formData.get('kidsHappy'),
    });

    if (!validatedFields.success) {
        const firstError = validatedFields.error.issues[0]?.message;
        return { message: firstError || "Please correct the errors.", success: false };
    }

    const { shiftId, revieweeId, rating, comment } = validatedFields.data;
    const tags = {
        kidsSafe: validatedFields.data.kidsSafe === 'on',
        punctual: validatedFields.data.punctual === 'on',
        cleanAndSafe: validatedFields.data.cleanAndSafe === 'on',
        kidsHappy: validatedFields.data.kidsHappy === 'on',
    }

    try {
        // This is a simplified action. A Cloud Function should listen for new reviews 
        // to securely update user ratings and karma scores, as a user cannot have permission
        // to write to another user's profile document.
        const shiftRef = doc(db, 'shifts', shiftId);
        const shiftDoc = await getDoc(shiftRef);
        if (!shiftDoc.exists() || !shiftDoc.data().userIds.includes(user.uid)) {
            throw new Error("Shift not found or you are not part of it.");
        }
        if (shiftDoc.data().status === 'completed') {
            throw new Error("This shift has already been completed/reviewed.");
        }

        await addDoc(collection(db, 'reviews'), {
            shiftId,
            revieweeId,
            reviewerId: user.uid,
            rating,
            comment: comment || '',
            tags,
            createdAt: serverTimestamp(),
        });
        
        await updateDoc(shiftRef, { status: 'completed' });

        revalidatePath('/families/calendar');
        revalidatePath(`/families/profile/${revieweeId}`);

        return { success: true, message: "Your review has been submitted! User ratings will be updated shortly." };

    } catch (error) {
        console.error("Error submitting review:", error);
        const message = error instanceof Error ? error.message : "An unexpected error occurred.";
        return { success: false, message };
    }
}
