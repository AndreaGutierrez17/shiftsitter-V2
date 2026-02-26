'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
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
  daysNeeded: z.array(z.string()),
  shiftsNeeded: z.array(z.string()),
  availability: z.string(),
  interestSelections: z.array(z.string()),
  interestsOther: z.string().optional(),
  interests: z.string(),
  smokeFree: z.boolean().optional(),
  petsOk: z.boolean().optional(),
  drivingLicense: z.boolean().optional(),
  specialNeedsOk: z.boolean().optional(),
}).superRefine((data, ctx) => {
  const isFamilyRole = data.role === 'parent' || data.role === 'reciprocal';
  if (isFamilyRole && data.daysNeeded.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['daysNeeded'], message: 'Please select at least one day.' });
  }
  if (isFamilyRole && data.shiftsNeeded.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shiftsNeeded'], message: 'Please select at least one shift.' });
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

function buildInterestsSummary(selected: string[], other?: string) {
  const otherValue = other?.trim();
  return (otherValue ? [...selected, otherValue] : selected).join(', ');
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
      daysNeeded: [],
      shiftsNeeded: [],
      availability: '',
      interestSelections: [],
      interestsOther: '',
      interests: '',
      smokeFree: false,
      petsOk: false,
      drivingLicense: false,
      specialNeedsOk: false,
    },
  });

  const watchedCity = useWatch({ control: form.control, name: 'city' });
  const watchedState = useWatch({ control: form.control, name: 'state' });
  const watchedZip = useWatch({ control: form.control, name: 'zip' });
  const watchedDaysNeeded = useWatch({ control: form.control, name: 'daysNeeded' }) ?? [];
  const watchedShiftsNeeded = useWatch({ control: form.control, name: 'shiftsNeeded' }) ?? [];
  const watchedInterestSelections = useWatch({ control: form.control, name: 'interestSelections' }) ?? [];
  const watchedInterestsOther = useWatch({ control: form.control, name: 'interestsOther' });
  const watchedNumberOfChildren = useWatch({ control: form.control, name: 'numberOfChildren' }) as number | undefined;

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
    const nextAvailability = buildAvailabilitySummary(watchedDaysNeeded, watchedShiftsNeeded);
    if (form.getValues('availability') !== nextAvailability) form.setValue('availability', nextAvailability);
  }, [form, watchedDaysNeeded, watchedShiftsNeeded]);

  useEffect(() => {
    const nextInterests = buildInterestsSummary(watchedInterestSelections, watchedInterestsOther);
    if (form.getValues('interests') !== nextInterests) form.setValue('interests', nextInterests);
  }, [form, watchedInterestSelections, watchedInterestsOther]);

  const totalSteps = ONBOARDING_STEPS.length;
  const selectedRole = form.watch('role');
  const familyRole = selectedRole === 'parent' || selectedRole === 'reciprocal';
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
    if (currentStep > 0) setCurrentStep((prev) => prev - 1);
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
      const interestsArray = data.interests.split(',').map((item) => item.trim()).filter(Boolean);

      const userProfile = {
        id: user.uid,
        email: user.email,
        name: data.name,
        photoURLs: user.photoURL ? [user.photoURL] : [],
        profileComplete: true,
        age: data.age,
        role: data.role,
        location: data.location,
        state: data.state,
        city: data.city.trim(),
        zip: data.zip,
        workplace: data.workplace || '',
        numberOfChildren: data.numberOfChildren ?? null,
        childAge: data.childAge ?? null,
        childrenAgesText: data.childrenAgesText?.trim() || '',
        needs: data.needs || '',
        daysNeeded: data.daysNeeded,
        shiftsNeeded: data.shiftsNeeded,
        availability: data.availability,
        interestSelections: data.interestSelections,
        interestsOther: data.interestsOther?.trim() || '',
        interestsText: data.interests,
        interests: interestsArray,
        smokeFree: data.smokeFree ?? false,
        petsOk: data.petsOk ?? false,
        drivingLicense: data.drivingLicense ?? false,
        specialNeedsOk: data.specialNeedsOk ?? false,
        backgroundCheckStatus: 'not_started' as const,
        latitude: 39.2904,
        longitude: -76.6122,
        isDemo: false,
      };

      await setDoc(userDocRef, userProfile, { merge: true });

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
    <div className="onb-shell">
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
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">Add the practical details we should use for matching and scheduling.</p>

                      {(selectedRole === 'parent' || selectedRole === 'reciprocal') && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="numberOfChildren"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Number of children</FormLabel>
                                <Select value={typeof field.value === 'number' ? String(field.value) : undefined} onValueChange={(value) => field.onChange(Number(value))}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    {CHILD_COUNT_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="childAge"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Edad del nino mas pequeno (opcional)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Ej. 3"
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
                        </div>
                      )}

                      {(selectedRole === 'parent' || selectedRole === 'reciprocal') && (
                        <FormField
                          control={form.control}
                          name="childrenAgesText"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Edades de los ninos (opcional)</FormLabel>
                              <FormControl>
                                <Input placeholder="Ej. 2, 5, 8" {...field} />
                              </FormControl>
                              <p className="text-xs text-muted-foreground">
                                Puedes escribir una o varias edades separadas por coma (ej. 2, 5, 8).
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

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
                            <FormLabel>Needs or what you offer (Optional)</FormLabel>
                            <FormControl><Textarea placeholder="Briefly describe what support you need or offer." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Select the schedule patterns that best fit your needs or availability.</p>

                        <FormField
                          control={form.control}
                          name="daysNeeded"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Days {familyRole ? '*' : '(optional)'}</FormLabel>
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
                          name="shiftsNeeded"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Shifts {familyRole ? '*' : '(optional)'}</FormLabel>
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
                      </div>

                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Quick profile preferences (optional).</p>
                        <div className="space-y-3 rounded-md border p-4">
                          <FormField control={form.control} name="smokeFree" render={({ field }) => (
                            <FormItem className="flex items-center justify-between space-y-0">
                              <FormLabel className="font-normal">Smoke-free environment</FormLabel>
                              <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="petsOk" render={({ field }) => (
                            <FormItem className="flex items-center justify-between space-y-0">
                              <FormLabel className="font-normal">Comfortable with pets</FormLabel>
                              <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="drivingLicense" render={({ field }) => (
                            <FormItem className="flex items-center justify-between space-y-0">
                              <FormLabel className="font-normal">Has a valid driver's license</FormLabel>
                              <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="specialNeedsOk" render={({ field }) => (
                            <FormItem className="flex items-center justify-between space-y-0">
                              <FormLabel className="font-normal">Open to special needs support</FormLabel>
                              <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                          )} />
                        </div>
                      </div>

                      <div className="space-y-4">
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
                    </div>
                  )}

                  {currentStep === 4 && (
                    <div className="text-center">
                      <h3 className="text-lg font-semibold">Final step</h3>
                      <p className="mt-2 text-muted-foreground">
                        Your profile basics are ready. Next, you will add photos and any additional details.
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
              <div className="flex justify-between pt-4">
                <button type="button" className="ss-btn-outline" onClick={handleBack} disabled={isSaving || currentStep === 0}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </button>
                <button type="button" className="ss-btn" onClick={handleNext} disabled={isSaving}>
                  {isSaving ? 'Saving...' : currentStep === totalSteps - 1 ? 'Finish & Add Photos' : 'Next'}
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
