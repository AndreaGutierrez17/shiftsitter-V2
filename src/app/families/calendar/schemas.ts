import * as z from 'zod';

export const shiftProposalSchema = z.object({
  accepterId: z.string().min(1, { message: 'You must select a match to propose to.' }),
  date: z.string().min(1, { message: 'Date is required.' }),
  startTime: z.string().min(1, { message: 'Start time is required.' }),
  endTime: z.string().min(1, { message: 'End time is required.' }),
}).refine(data => data.endTime > data.startTime, {
  message: 'End time must be after start time.',
  path: ['endTime'],
});

export type ShiftProposalState = {
  message: string;
  success: boolean;
};

export const shiftSwapProposalSchema = z.object({
  shiftId: z.string().min(1),
  newDate: z.string().min(1, { message: 'New date is required.' }),
  newStartTime: z.string().min(1, { message: 'New start time is required.' }),
  newEndTime: z.string().min(1, { message: 'New end time is required.' }),
}).refine(data => data.newEndTime > data.newStartTime, {
  message: 'New end time must be after new start time.',
  path: ['newEndTime'],
});

export type ShiftSwapProposalState = {
  message: string;
  success: boolean;
};

export const reviewSchema = z.object({
  shiftId: z.string().min(1),
  revieweeId: z.string().min(1),
  rating: z.coerce.number().min(1,"Please provide a rating.").max(5),
  comment: z.string().optional(),
  kidsSafe: z.string().optional(),
  punctual: z.string().optional(),
  cleanAndSafe: z.string().optional(),
  kidsHappy: z.string().optional(),
});

export type ReviewState = {
    message: string;
    success: boolean;
};

