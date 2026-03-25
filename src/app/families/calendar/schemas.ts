import * as z from 'zod';

const isOnOrAfterToday = (value: string) => {
  const candidate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(candidate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return candidate.getTime() >= today.getTime();
};

export const shiftProposalSchema = z.object({
  accepterId: z.string().min(1, { message: 'You must select a match to propose to.' }),
  date: z.string().min(1, { message: 'Date is required.' }),
  startTime: z.string().min(1, { message: 'Start time is required.' }),
  endTime: z.string().min(1, { message: 'End time is required.' }),
  numberOfChildren: z.coerce.number().int().min(0).optional(),
  careLocation: z.enum(['my_home', 'their_home']).optional(),
  extras: z.string().max(120).optional(),
  primaryPhone: z.string().max(40).optional(),
  emergencyContact: z.string().max(120).optional(),
}).refine(data => data.endTime > data.startTime, {
  message: 'End time must be after start time.',
  path: ['endTime'],
}).superRefine((data, ctx) => {
  if (!isOnOrAfterToday(data.date)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Date cannot be in the past.',
      path: ['date'],
    });
  }
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
}).superRefine((data, ctx) => {
  if (!isOnOrAfterToday(data.newDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'New date cannot be in the past.',
      path: ['newDate'],
    });
  }
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

