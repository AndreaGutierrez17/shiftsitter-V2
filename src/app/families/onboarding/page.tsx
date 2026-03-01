'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';

import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { ONBOARDING_STEPS } from '@/lib/constants';
import { ArrowLeft, ArrowRight, Repeat, User, Users } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';

const BETA_MD_ONLY_MESSAGE = 'ShiftSitter beta is currently available in Maryland only.';
const ALLOWLIST_TEST_EMAILS = ['PON_AQUI_EMAIL_DE_ANDY'];

const US_STATE_OPTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
] as const;

const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SHIFT_OPTIONS = ['Early', 'Day', 'Evening', 'Night'] as const;
const INTEREST_OPTIONS = ['Reading', 'Arts & Crafts', 'Outdoor Play', 'Homework Help', 'Cooking', 'Sports', 'Music', 'STEM Activities'] as const;
const DURATION_OPTIONS = ['1-4', '4-8', '8-12', '12', '12+'] as const;
const HOURS_PER_MONTH_OPTIONS = ['0-4', '4-8', '8-12', '12+'] as const;
const SETTING_OPTIONS = [
  { value: 'my_home', label: 'My home' },
  { value: 'their_home', label: 'Their home' },
  { value: 'either', label: 'Either is fine' },
] as const;
const HANDOFF_OPTIONS = [
  { value: 'pickup', label: 'My home' },
  { value: 'dropoff', label: 'Their home' },
  { value: 'my_workplace', label: 'My workplace' },
  { value: 'their_workplace', label: 'Their workplace' },
  { value: 'either', label: 'Flexible' },
] as const;
const TRAVEL_OPTIONS = ['5', '10', '15', '20', '30', '45'] as const;
const AGE_RANGE_OPTIONS = ['0-11 months', '1-3 years', '4-5 years', '6-11 years', '12+ years'] as const;
const EXTRA_OPTIONS = ['Light cleaning', 'Laundry', 'Meal prep', 'Groceries/Errands', 'Transportation', 'Pet help'] as const;
const PET_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'dog', label: 'Small / Dog' },
  { value: 'cat', label: 'Big / Cat' },
  { value: 'multiple', label: 'Multiple' },
  { value: 'unknown', label: 'Prefer not to say' },
] as const;

const CHILD_COUNT_OPTIONS = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5+' },
] as const;

const profileSchema = z.object({
  role: z.enum(['parent', 'sitter', 'reciprocal'], { message: 'Please select a role.' }),
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  age: z.coerce.number().min(18, 'You must be at least 18 years old.'),
  location: z.string().min(2, 'Location is required.'),
  state: z.string().min(2, 'State is required.'),
  city: z.string().trim().min(2, 'City is required.'),
  zip: z.string().regex(/^\d{5}$/, 'ZIP code must be 5 digits.'),
  workplace: z.string().optional(),
  numberOfChildren: z.coerce.number().optional(),
  childAge: z.coerce.number().optional(),
  childrenAgesText: z.string().optional(),
  needs: z.string().optional(),
  offerSummary: z.string().optional(),
  needDays: z.array(z.string()),
  needShifts: z.array(z.string()),
  needDurationBucket: z.string(),
  needSettingPreference: z.enum(['my_home', 'their_home', 'either']),
  needChildrenCount: z.string(),
  needSpecialNeeds: z.boolean().optional(),
  needSpecialNeedsNotes: z.string().optional(),
  requireSmokeFree: z.boolean().optional(),
  needPetsInHome: z.enum(['none', 'dog', 'cat', 'multiple', 'unknown']),
  needOkWithPets: z.boolean().optional(),
  needZipHome: z.string().regex(/^\d{5}$/, 'Home ZIP code must be 5 digits.'),
  needZipWork: z.string().optional(),
  needHandoffPreference: z.enum(['pickup', 'dropoff', 'my_workplace', 'their_workplace', 'either']),
  needMaxTravelMinutes: z.string(),
  needExtrasNeeded: z.array(z.string()),
  offerDays: z.array(z.string()),
  offerShifts: z.array(z.string()),
  offerHoursPerMonthBucket: z.string(),
  offerSettingPreference: z.enum(['my_home', 'their_home', 'either']),
  offerMaxChildrenTotal: z.string(),
  offerAgeRanges: z.array(z.string()),
  offerOkWithSpecialNeeds: z.boolean().optional(),
  offerHasVehicle: z.boolean().optional(),
  offerExtrasOffered: z.array(z.string()),
  daysNeeded: z.array(z.string()),
  shiftsNeeded: z.array(z.string()),
  availability: z.string(),
  interestSelections: z.array(z.string()),
  interestsOther: z.string().optional(),
  interests: z.string(),
  smokeFree: z.boolean().optional(),
  petsOk: z.boolean().optional(),
}).superRefine((data, ctx) => {
  const isFamilyRole = data.role === 'parent' || data.role === 'reciprocal';
  if (isFamilyRole && data.needDays.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['needDays'], message: 'Please select at least one day you need care.' });
  }
  if (isFamilyRole && data.needShifts.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['needShifts'], message: 'Please select at least one shift you need.' });
  }
  if (data.offerDays.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['offerDays'], message: 'Please select at least one day you can offer care.' });
  }
  if (data.offerShifts.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['offerShifts'], message: 'Please select at least one shift you can cover.' });
  }
  if (data.offerAgeRanges.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['offerAgeRanges'], message: 'Select at least one age range you can support.' });
  }
  if (data.interestSelections.length === 0 && !data.interestsOther?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['interestSelections'], message: 'Select at least one interest or add a custom one.' });
  }
});

type ProfileFormValues = z.input<typeof profileSchema>;

function toggleArrayValue(currentValues: string[], value: string, checked: boolean) {
  if (checked) return currentValues.includes(value) ? currentValues : [...currentValues, value];
  return currentValues.filter((item) => item !== value);
}

function buildLocation(city?: string, state?: string, zip?: string) {
  const safeCity = city?.trim() ?? '';
  const safeState = state?.trim() ?? '';
  const safeZip = zip?.trim() ?? '';
  if (!safeCity || !safeState || !safeZip) return '';
  return `${safeCity}, ${safeState} ${safeZip}`;
}

function buildAvailabilitySummary(days: string[], shifts: string[]) {
  if (days.length === 0 && shifts.length === 0) return '';
  if (days.length === 0) return shifts.join(', ');
  if (shifts.length === 0) return days.join(', ');
  return `${days.join(', ')} (${shifts.join(', ')})`;
}

function buildRoleAvailabilitySummary(role: string | undefined, needDays: string[], needShifts: string[], offerDays: string[], offerShifts: string[]) {
  const useNeedSide = role === 'parent' || role === 'reciprocal';
  return buildAvailabilitySummary(useNeedSide ? needDays : offerDays, useNeedSide ? needShifts : offerShifts);
}

function buildInterestsSummary(selected: string[], other?: string) {
  const otherValue = other?.trim();
  return (otherValue ? [...selected, otherValue] : selected).join(', ');
}

function parseChildrenAges(text?: string) {
  if (!text) return [] as number[];
  return text
    .split(/[,/; ]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function parseNumericText(value?: string) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function OnboardingForm() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedEmail = user?.email?.trim().toLowerCase() ?? '';
  const isAllowlistedEmail = ALLOWLIST_TEST_EMAILS.map((email) => email.toLowerCase()).includes(normalizedEmail);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      role: undefined,
      name: user?.displayName || '',
      age: undefined,
      location: '',
      state: 'MD',
      city: '',
      zip: '',
      workplace: '',
      numberOfChildren: undefined,
      childAge: undefined,
      childrenAgesText: '',
      needs: '',
      offerSummary: '',
      needDays: [],
      needShifts: [],
      needDurationBucket: '4-8',
      needSettingPreference: 'either',
      needChildrenCount: '1',
      needSpecialNeeds: false,
      needSpecialNeedsNotes: '',
      requireSmokeFree: false,
      needPetsInHome: 'unknown',
      needOkWithPets: false,
      needZipHome: '',
      needZipWork: '',
      needHandoffPreference: 'either',
      needMaxTravelMinutes: '30',
      needExtrasNeeded: [],
      offerDays: [],
      offerShifts: [],
      offerHoursPerMonthBucket: '4-8',
      offerSettingPreference: 'either',
      offerMaxChildrenTotal: '2',
      offerAgeRanges: [],
      offerOkWithSpecialNeeds: false,
      offerHasVehicle: false,
      offerExtrasOffered: [],
      daysNeeded: [],
      shiftsNeeded: [],
      availability: '',
      interestSelections: [],
      interestsOther: '',
      interests: '',
      smokeFree: false,
      petsOk: false,
    },
  });

  const watchedCity = useWatch({ control: form.control, name: 'city' });
  const watchedState = useWatch({ control: form.control, name: 'state' });
  const watchedZip = useWatch({ control: form.control, name: 'zip' });
  const watchedNeedDays = useWatch({ control: form.control, name: 'needDays' }) ?? [];
  const watchedNeedShifts = useWatch({ control: form.control, name: 'needShifts' }) ?? [];
  const watchedOfferDays = useWatch({ control: form.control, name: 'offerDays' }) ?? [];
  const watchedOfferShifts = useWatch({ control: form.control, name: 'offerShifts' }) ?? [];
  const watchedInterestSelections = useWatch({ control: form.control, name: 'interestSelections' }) ?? [];
  const watchedInterestsOther = useWatch({ control: form.control, name: 'interestsOther' });
  const selectedRoleWatch = useWatch({ control: form.control, name: 'role' });

  useEffect(() => {
    if (user?.displayName && !form.getValues('name')) form.setValue('name', user.displayName);
  }, [user, form]);

  useEffect(() => {
    if (!isAllowlistedEmail && form.getValues('state') !== 'MD') form.setValue('state', 'MD', { shouldValidate: true });
  }, [form, isAllowlistedEmail]);

  useEffect(() => {
    const nextLocation = buildLocation(watchedCity, watchedState, watchedZip);
    if (form.getValues('location') !== nextLocation) form.setValue('location', nextLocation);
  }, [form, watchedCity, watchedState, watchedZip]);

  useEffect(() => {
    const nextAvailability = buildRoleAvailabilitySummary(selectedRoleWatch, watchedNeedDays, watchedNeedShifts, watchedOfferDays, watchedOfferShifts);
    if (form.getValues('availability') !== nextAvailability) form.setValue('availability', nextAvailability);
  }, [form, selectedRoleWatch, watchedNeedDays, watchedNeedShifts, watchedOfferDays, watchedOfferShifts]);

  useEffect(() => {
    const useNeedSide = selectedRoleWatch === 'parent' || selectedRoleWatch === 'reciprocal';
    const nextDays = useNeedSide ? watchedNeedDays : watchedOfferDays;
    const nextShifts = useNeedSide ? watchedNeedShifts : watchedOfferShifts;
    if (JSON.stringify(form.getValues('daysNeeded')) !== JSON.stringify(nextDays)) form.setValue('daysNeeded', nextDays);
    if (JSON.stringify(form.getValues('shiftsNeeded')) !== JSON.stringify(nextShifts)) form.setValue('shiftsNeeded', nextShifts);
  }, [form, selectedRoleWatch, watchedNeedDays, watchedNeedShifts, watchedOfferDays, watchedOfferShifts]);

  useEffect(() => {
    const nextInterests = buildInterestsSummary(watchedInterestSelections, watchedInterestsOther);
    if (form.getValues('interests') !== nextInterests) form.setValue('interests', nextInterests);
  }, [form, watchedInterestSelections, watchedInterestsOther]);

  const totalSteps = ONBOARDING_STEPS.length;
  const stateOptions = isAllowlistedEmail ? US_STATE_OPTIONS : (['MD'] as const);
  const progressValue = ((currentStep + 1) / totalSteps) * 100;

  const validateMarylandGate = () => {
    if (!isAllowlistedEmail && form.getValues('state') !== 'MD') {
      form.setError('state', { type: 'manual', message: BETA_MD_ONLY_MESSAGE });
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    const fieldsToValidate = [...ONBOARDING_STEPS[currentStep].fields] as (keyof ProfileFormValues)[];
    const isValid = await form.trigger(fieldsToValidate);
    if (!isValid) return;
    if (currentStep === 1 && !validateMarylandGate()) return;

    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
      return;
    }
    await onSubmit(form.getValues());
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      return;
    }
    router.back();
  };

  async function onSubmit(data: ProfileFormValues) {
    if (!user) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to create a profile.' });
      return;
    }
    if (!isAllowlistedEmail && data.state !== 'MD') {
      form.setError('state', { type: 'manual', message: BETA_MD_ONLY_MESSAGE });
      toast({ variant: 'destructive', title: 'Location restricted', description: BETA_MD_ONLY_MESSAGE });
      setCurrentStep(1);
      return;
    }

    setIsSaving(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const profileDocRef = doc(db, 'profiles', user.uid);
      const answersDocRef = doc(db, 'user_answers', user.uid);
      const interestsArray = data.interests.split(',').map((item) => item.trim()).filter(Boolean);
      const childrenAges = parseChildrenAges(data.childrenAgesText);
      const normalizedChildrenCount = parseNumericText(data.needChildrenCount);
      const normalizedOfferCapacity = parseNumericText(data.offerMaxChildrenTotal);
      const normalizedTravelMinutes = parseNumericText(data.needMaxTravelMinutes) || 30;
      const normalizedNeedZipWork = data.needZipWork?.trim() || data.zip;
      const needDays = data.needDays;
      const needShifts = data.needShifts;
      const offerDays = data.offerDays;
      const offerShifts = data.offerShifts;
      const need = {
        days: needDays,
        shifts: needShifts,
        durationBucket: data.needDurationBucket,
        settingPreference: data.needSettingPreference,
        childrenCount: normalizedChildrenCount,
        childrenAges,
        specialNeeds: {
          has: data.needSpecialNeeds ?? false,
          notes: data.needSpecialNeedsNotes?.trim() || '',
        },
        smokeFree: data.smokeFree ?? false,
        requireSmokeFree: data.requireSmokeFree ?? false,
        petsInHome: data.needPetsInHome,
        okWithPets: data.needOkWithPets ?? false,
        zipHome: data.needZipHome,
        zipWork: normalizedNeedZipWork,
        handoffPreference: data.needHandoffPreference,
        maxTravelMinutes: normalizedTravelMinutes,
        extrasNeeded: data.needExtrasNeeded,
      };
      const offer = {
        days: offerDays,
        shifts: offerShifts,
        hoursPerMonthBucket: data.offerHoursPerMonthBucket,
        settingPreference: data.offerSettingPreference,
        maxChildrenTotal: Math.max(1, normalizedOfferCapacity || (data.role === 'sitter' ? 2 : normalizedChildrenCount || 1)),
        ageRanges: data.offerAgeRanges,
        okWithSpecialNeeds: data.offerOkWithSpecialNeeds ?? false,
        hasVehicle: data.offerHasVehicle ?? false,
        extrasOffered: data.offerExtrasOffered,
        smokeFree: data.smokeFree ?? false,
        okWithPets: data.petsOk ?? false,
        zipHome: data.needZipHome,
        zipWork: normalizedNeedZipWork,
        handoffPreference: data.needHandoffPreference,
        maxTravelMinutes: normalizedTravelMinutes,
      };

      const publicProfile = {
        uid: user.uid,
        role: 'family',
        familyRole: data.role,
        displayName: data.name,
        photoURL: user.photoURL || null,
        photoURLs: user.photoURL ? [user.photoURL] : [],
        homeZip: data.zip,
        workZip: normalizedNeedZipWork,
        state: data.state,
        city: data.city.trim(),
        location: data.location,
        onboardingComplete: true,
        verificationStatus: 'unverified' as const,
        updatedAt: serverTimestamp(),
      };

      const answers = {
        family_role: data.role,
        need_days: needDays,
        need_shifts: needShifts,
        give_days: offerDays,
        give_shifts: offerShifts,
        extras_need: data.needExtrasNeeded,
        extras_offer: data.offerExtrasOffered,
        smoke_free_required: data.requireSmokeFree ?? false,
        smoke_free: data.smokeFree ?? false,
        pets_in_home: data.needPetsInHome,
        okay_with_pets: data.needOkWithPets ?? false,
        setting_need: data.needSettingPreference,
        setting_offer: data.offerSettingPreference,
        handoff_need: data.needHandoffPreference,
        handoff_offer: data.needHandoffPreference,
        travel_max_minutes: normalizedTravelMinutes,
        home_zip: data.zip,
        work_zip: normalizedNeedZipWork,
        interests: interestsArray,
      };

      const userProfile = {
        id: user.uid,
        uid: user.uid,
        email: user.email,
        name: data.name,
        photoURLs: user.photoURL ? [user.photoURL] : [],
        profileComplete: true,
        accountType: 'family',
        age: data.age,
        role: data.role,
        location: data.location,
        state: data.state,
        city: data.city.trim(),
        zip: data.zip,
        workplace: data.workplace || '',
        numberOfChildren: normalizedChildrenCount || null,
        childAge: data.childAge ?? null,
        childrenAgesText: data.childrenAgesText?.trim() || '',
        needs: data.needs || '',
        offerSummary: data.offerSummary?.trim() || '',
        daysNeeded: (data.role === 'parent' || data.role === 'reciprocal') ? needDays : offerDays,
        shiftsNeeded: (data.role === 'parent' || data.role === 'reciprocal') ? needShifts : offerShifts,
        availability: data.availability,
        interestSelections: data.interestSelections,
        interestsOther: data.interestsOther?.trim() || '',
        interestsText: data.interests,
        interests: interestsArray,
        smokeFree: data.smokeFree ?? false,
        petsOk: data.needOkWithPets ?? false,
        drivingLicense: data.offerHasVehicle ?? false,
        specialNeedsOk: data.offerOkWithSpecialNeeds ?? false,
        need,
        offer,
        onboardingComplete: true,
        access: {
          source: 'manual',
          status: 'active',
          updatedAt: serverTimestamp(),
          notes: 'Family onboarding completed.',
        },
        updatedAt: serverTimestamp(),
        backgroundCheckStatus: 'not_started' as const,
        isDemo: false,
      };

      const batch = writeBatch(db);
      batch.set(userDocRef, userProfile, { merge: true });
      batch.set(profileDocRef, publicProfile, { merge: true });
      batch.set(
        answersDocRef,
        {
          uid: user.uid,
          answers,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();

      toast({
        title: 'Profile Created!',
        description: "Welcome to the community! Now let's add your photos.",
      });
      router.push('/families/profile/edit');
    } catch (error: any) {
      console.log(error);
      toast({
        variant: 'destructive',
        title: 'Oops! Something went wrong.',
        description:
          error.code === 'permission-denied'
            ? 'Permission error. Check your Firestore security rules.'
            : error.message || 'Could not save your profile.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="onb-shell" lang="en" translate="no">
      <div className="onb-card">
        <div className="p-6">
          <Progress value={progressValue} className="mb-4" />
          <h2 className="text-2xl font-semibold tracking-tight font-headline">{ONBOARDING_STEPS[currentStep].title}</h2>
          <p className="text-sm text-muted-foreground">Step {currentStep + 1} of {totalSteps}. Let's get your profile set up.</p>
        </div>
        <div className="p-6 pt-0">
          <Form {...form}>
            <form className="space-y-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.3 }}
                >
                  {currentStep === 0 && (
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel>Main goal *</FormLabel>
                          <FormControl>
                            <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col gap-2">
                              <FormItem className={`flex items-center space-x-3 space-y-0 rounded-xl border p-4 transition-colors ${field.value === 'parent' ? 'border-primary/50 bg-accent' : 'bg-white hover:bg-accent/40'}`}>
                                <FormControl><RadioGroupItem value="parent" /></FormControl>
                                <FormLabel className="flex cursor-pointer items-center gap-3 font-normal"><User className="text-primary" /> I am a parent looking for a sitter.</FormLabel>
                              </FormItem>
                              <FormItem className={`flex items-center space-x-3 space-y-0 rounded-xl border p-4 transition-colors ${field.value === 'sitter' ? 'border-primary/50 bg-accent' : 'bg-white hover:bg-accent/40'}`}>
                                <FormControl><RadioGroupItem value="sitter" /></FormControl>
                                <FormLabel className="flex cursor-pointer items-center gap-3 font-normal"><Users className="text-primary" /> I am a sitter looking for families.</FormLabel>
                              </FormItem>
                              <FormItem className={`flex items-center space-x-3 space-y-0 rounded-xl border p-4 transition-colors ${field.value === 'reciprocal' ? 'border-primary/50 bg-accent' : 'bg-white hover:bg-accent/40'}`}>
                                <FormControl><RadioGroupItem value="reciprocal" /></FormControl>
                                <FormLabel className="flex cursor-pointer items-center gap-3 font-normal"><Repeat className="text-primary" /> I am a parent looking for reciprocal exchanges.</FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name *</FormLabel>
                            <FormControl><Input placeholder="e.g., Sofia Perez" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="age"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Age *</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                placeholder="18+"
                                name={field.name}
                                onBlur={field.onBlur}
                                ref={field.ref}
                                value={typeof field.value === 'number' ? field.value : ''}
                                onChange={(e) => {
                                  const next = e.target.value.replace(/\D/g, '');
                                  field.onChange(next === '' ? undefined : Number(next));
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {!isAllowlistedEmail && (
                        <p className="rounded-md border border-primary/20 bg-accent p-3 text-sm text-muted-foreground">
                          {BETA_MD_ONLY_MESSAGE}
                        </p>
                      )}

                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State *</FormLabel>
                              <Select
                                value={field.value || 'MD'}
                                onValueChange={(value) => {
                                  if (!isAllowlistedEmail && value !== 'MD') {
                                    form.setError('state', { type: 'manual', message: BETA_MD_ONLY_MESSAGE });
                                    field.onChange('MD');
                                    return;
                                  }
                                  form.clearErrors('state');
                                  field.onChange(value);
                                }}
                              >
                                <FormControl><SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  {stateOptions.map((stateCode) => (
                                    <SelectItem key={stateCode} value={stateCode}>{stateCode}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>City *</FormLabel>
                              <FormControl><Input placeholder="e.g., Baltimore" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="zip"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ZIP *</FormLabel>
                              <FormControl>
                                <Input
                                  inputMode="numeric"
                                  maxLength={5}
                                  placeholder="21201"
                                  value={field.value || ''}
                                  onChange={(e) => field.onChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  ref={field.ref}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {currentStep === 2 && (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">Step 1 from the match engine: define exactly what you need so hard filters only show relevant matches.</p>

                      <FormField
                        control={form.control}
                        name="needDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Which days do you typically need childcare? *</FormLabel>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {DAY_OPTIONS.map((day) => {
                                const selected = (field.value ?? []).includes(day);
                                return (
                                  <label key={day} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                    <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], day, checked === true))} />
                                    <span>{day}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="needShifts"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Which shift(s) do you need help with? *</FormLabel>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {SHIFT_OPTIONS.map((shift) => {
                                const selected = (field.value ?? []).includes(shift);
                                return (
                                  <label key={shift} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                    <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], shift, checked === true))} />
                                    <span>{shift}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="needDurationBucket" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Typical duration</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                {DURATION_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>{option} hours</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="needSettingPreference" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Where do you prefer care?</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                {SETTING_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="needChildrenCount" render={({ field }) => (
                          <FormItem>
                            <FormLabel>How many children need care? *</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                {CHILD_COUNT_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="childrenAgesText" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Age of each child</FormLabel>
                            <FormControl><Input placeholder="e.g., 2, 5, 8" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="space-y-3 rounded-md border p-4">
                        <FormField control={form.control} name="needSpecialNeeds" render={({ field }) => (
                          <FormItem className="flex items-center justify-between space-y-0">
                            <FormLabel className="font-normal">Any special considerations or specific needs?</FormLabel>
                            <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="needSpecialNeedsNotes" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes (optional)</FormLabel>
                            <FormControl><Textarea placeholder="Short note about routines or care considerations." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="space-y-3 rounded-md border p-4">
                        <FormField control={form.control} name="smokeFree" render={({ field }) => (
                          <FormItem className="flex items-center justify-between space-y-0">
                            <FormLabel className="font-normal">Is your home smoke-free?</FormLabel>
                            <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="requireSmokeFree" render={({ field }) => (
                          <FormItem className="flex items-center justify-between space-y-0">
                            <FormLabel className="font-normal">Require your match to be smoke-free?</FormLabel>
                            <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="needOkWithPets" render={({ field }) => (
                          <FormItem className="flex items-center justify-between space-y-0">
                            <FormLabel className="font-normal">Are you okay with pets?</FormLabel>
                            <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="needPetsInHome" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pets in your home</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                {PET_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="needZipHome" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Home ZIP code *</FormLabel>
                            <FormControl><Input inputMode="numeric" maxLength={5} value={field.value || ''} onChange={(e) => field.onChange(e.target.value.replace(/\D/g, '').slice(0, 5))} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="needZipWork" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Work ZIP code (optional)</FormLabel>
                            <FormControl><Input inputMode="numeric" maxLength={5} value={field.value || ''} onChange={(e) => field.onChange(e.target.value.replace(/\D/g, '').slice(0, 5))} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="needHandoffPreference" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Where should handoff normally happen?</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                {HANDOFF_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="needMaxTravelMinutes" render={({ field }) => (
                          <FormItem>
                            <FormLabel>How far will you travel?</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                {TRAVEL_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>{option === '45' ? 'More than 30 minutes' : `${option} minutes`}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <FormField control={form.control} name="needExtrasNeeded" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Which extras do you need help with?</FormLabel>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {EXTRA_OPTIONS.map((extra) => {
                              const selected = (field.value ?? []).includes(extra);
                              return (
                                <label key={extra} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                  <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], extra, checked === true))} />
                                  <span>{extra}</span>
                                </label>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">Step 2 from the match engine: define what you can offer in return so reciprocity is visible and rankable.</p>

                      <FormField
                        control={form.control}
                        name="offerDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Which days can you provide care? *</FormLabel>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {DAY_OPTIONS.map((day) => {
                                const selected = (field.value ?? []).includes(day);
                                return (
                                  <label key={day} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                    <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], day, checked === true))} />
                                    <span>{day}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="offerShifts"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Which shift(s) can you cover? *</FormLabel>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {SHIFT_OPTIONS.map((shift) => {
                                const selected = (field.value ?? []).includes(shift);
                                return (
                                  <label key={shift} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                    <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], shift, checked === true))} />
                                    <span>{shift}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="offerHoursPerMonthBucket" render={({ field }) => (
                          <FormItem>
                            <FormLabel>How many hours can you realistically give per month? *</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                {HOURS_PER_MONTH_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>{option} hours</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="offerSettingPreference" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Where are you comfortable providing care?</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                {SETTING_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="offerMaxChildrenTotal" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Total children you can supervise *</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                {CHILD_COUNT_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="offerHasVehicle" render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-md border p-4">
                            <FormLabel className="font-normal">Do you have your own vehicle?</FormLabel>
                            <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )} />
                      </div>

                      <FormField control={form.control} name="offerAgeRanges" render={({ field }) => (
                        <FormItem>
                          <FormLabel>What age ranges are you comfortable caring for? *</FormLabel>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {AGE_RANGE_OPTIONS.map((range) => {
                              const selected = (field.value ?? []).includes(range);
                              return (
                                <label key={range} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                  <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], range, checked === true))} />
                                  <span>{range}</span>
                                </label>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="space-y-3 rounded-md border p-4">
                        <FormField control={form.control} name="offerOkWithSpecialNeeds" render={({ field }) => (
                          <FormItem className="flex items-center justify-between space-y-0">
                            <FormLabel className="font-normal">Comfortable caring for children with special needs</FormLabel>
                            <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )} />
                      </div>

                      <FormField control={form.control} name="offerExtrasOffered" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Optional extras you&apos;re willing to offer</FormLabel>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {EXTRA_OPTIONS.map((extra) => {
                              const selected = (field.value ?? []).includes(extra);
                              return (
                                <label key={extra} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                  <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], extra, checked === true))} />
                                  <span>{extra}</span>
                                </label>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}

                  {currentStep === 4 && (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">Add the extra profile details that improve ranking, transparency, and match summaries.</p>

                      <div className="space-y-3 rounded-md border p-4">
                        <FormField control={form.control} name="petsOk" render={({ field }) => (
                          <FormItem className="flex items-center justify-between space-y-0">
                            <FormLabel className="font-normal">Comfortable with pets in another home</FormLabel>
                            <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )} />
                      </div>

                      <FormField
                        control={form.control}
                        name="workplace"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Workplace / Profession (Optional)</FormLabel>
                            <FormControl><Input placeholder="e.g., Nurse at City Hospital" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="needs"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Need summary</FormLabel>
                            <FormControl><Textarea placeholder="Briefly describe the support you need." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="offerSummary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Offer summary</FormLabel>
                            <FormControl><Textarea placeholder="Describe what you can offer back." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="interestSelections"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Interests *</FormLabel>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {INTEREST_OPTIONS.map((interest) => {
                                const selected = (field.value ?? []).includes(interest);
                                return (
                                  <label key={interest} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                    <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], interest, checked === true))} />
                                    <span>{interest}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="interestsOther"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Other (optional)</FormLabel>
                            <FormControl><Input placeholder="e.g., Bilingual care" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {currentStep === 5 && (
                    <div className="space-y-5">
                      <div className="rounded-lg border p-4">
                        <h3 className="text-lg font-semibold">Summary</h3>
                        <p className="mt-2 text-sm text-muted-foreground">Review your details before saving your match profile.</p>
                        <div className="mt-4 space-y-2 text-sm">
                          <div><span className="font-medium">Need:</span> {watchedNeedDays.join(', ') || 'No days'} {watchedNeedShifts.length ? `(${watchedNeedShifts.join(', ')})` : ''}</div>
                          <div><span className="font-medium">Offer:</span> {watchedOfferDays.join(', ') || 'No days'} {watchedOfferShifts.length ? `(${watchedOfferShifts.join(', ')})` : ''}</div>
                          <div><span className="font-medium">Children needing care:</span> {form.getValues('needChildrenCount')}</div>
                          <div><span className="font-medium">Offer capacity:</span> {form.getValues('offerMaxChildrenTotal')}</div>
                          <div><span className="font-medium">Need extras:</span> {form.getValues('needExtrasNeeded').join(', ') || 'None'}</div>
                          <div><span className="font-medium">Offer extras:</span> {form.getValues('offerExtrasOffered').join(', ') || 'None'}</div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                        Before using secure messages or calendar, upload your ID front and selfie in Profile Edit. Verification activates automatically as soon as both files are uploaded.
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
              <div className="flex justify-between pt-4">
                <button type="button" className="ss-btn-outline" onClick={handleBack} disabled={isSaving}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </button>
                <button type="button" className="ss-btn" onClick={handleNext} disabled={isSaving}>
                  {isSaving ? 'Saving...' : currentStep === totalSteps - 1 ? 'Finish & Add Photos / Verification' : 'Next'}
                  {!isSaving && currentStep < totalSteps - 1 && <ArrowRight className="ml-2 h-4 w-4" />}
                </button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <OnboardingForm />
    </AuthGuard>
  );
}
