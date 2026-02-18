'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { ONBOARDING_STEPS } from '@/lib/constants';
import { ArrowLeft, ArrowRight, User, Users, Repeat } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import type { UserRole } from '@/lib/types';

const profileSchema = z.object({
  role: z.enum(['parent', 'sitter', 'reciprocal'], { message: 'Please select a role.' }),
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  age: z.coerce.number().min(18, 'You must be at least 18 years old.'),
  location: z.string().min(2, 'Location is required.'),
  
  workplace: z.string().optional(),
  numberOfChildren: z.coerce.number().optional(),
  childAge: z.coerce.number().optional(),
  needs: z.string().optional(),
  
  availability: z.string().min(3, 'Availability is required.'),
  interests: z.string().min(2, 'Please list at least one interest.'),
});


type ProfileFormValues = z.input<typeof profileSchema>;

function OnboardingForm() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.displayName || '',
      age: 18,
      location: '',
      workplace: '',
      numberOfChildren: undefined,
      childAge: undefined,
      needs: '',
      availability: '',
      interests: '',
    },
  });

  useEffect(() => {
    if (user?.displayName && !form.getValues('name')) {
      form.setValue('name', user.displayName);
    }
  }, [user, form]);

  const totalSteps = ONBOARDING_STEPS.length;

  const handleNext = async () => {
    const fieldsToValidate = ONBOARDING_STEPS[currentStep].fields;
    // @ts-ignore
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      if (currentStep < totalSteps - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        await onSubmit(form.getValues());
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  async function onSubmit(data: ProfileFormValues) {
    if (!user) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to create a profile.' });
      return;
    }
    setIsSaving(true);
    try {
      const userDocRef = doc(db, "users", user.uid);
      
      const userProfile = {
        id: user.uid,
        email: user.email,
        name: data.name,
        photoURLs: user.photoURL ? [user.photoURL] : [],
        profileComplete: true,
        age: data.age,
        role: data.role,
        location: data.location,
        workplace: data.workplace || '',
        numberOfChildren: data.numberOfChildren,
        childAge: data.childAge,
        needs: data.needs || '',
        availability: data.availability,
        interests: data.interests.split(',').map(i => i.trim()),
        backgroundCheckStatus: 'not_started' as const,
        latitude: 39.2904, // Mocked
        longitude: -76.6122, // Mocked,
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
        description: error.code === 'permission-denied' 
            ? 'Permission error. Check your Firestore security rules.' 
            : error.message || 'Could not save your profile.',
      });
    } finally {
        setIsSaving(false);
    }
  }

  const progressValue = ((currentStep + 1) / totalSteps) * 100;
  const selectedRole = form.watch('role');


  return (
      <div className="onb-shell">
        <div className="onb-card">
          <div className='p-6'>
            <Progress value={progressValue} className="mb-4" />
            <h2 className="text-2xl font-semibold tracking-tight font-headline">{ONBOARDING_STEPS[currentStep].title}</h2>
            <p className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {totalSteps}. Let's get to know you.
            </p>
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
                            <FormLabel>First, what is your main goal?</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-2"
                              >
                                <FormItem className="flex items-center space-x-3 space-y-0 p-4 rounded-md border has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:border-primary/50">
                                  <FormControl><RadioGroupItem value="parent" /></FormControl>
                                  <FormLabel className="font-normal flex items-center gap-3 cursor-pointer"><User className="text-primary"/> I'm a parent looking for a sitter.</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0 p-4 rounded-md border has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:border-primary/50">
                                  <FormControl><RadioGroupItem value="sitter" /></FormControl>
                                  <FormLabel className="font-normal flex items-center gap-3 cursor-pointer"><Users className="text-primary"/> I'm a sitter looking for families.</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0 p-4 rounded-md border has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:border-primary/50">
                                  <FormControl><RadioGroupItem value="reciprocal" /></FormControl>
                                  <FormLabel className="font-normal flex items-center gap-3 cursor-pointer"><Repeat className="text-primary"/> I'm a parent looking for reciprocal exchanges.</FormLabel>
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
                        <FormField control={form.control} name="name" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl><Input placeholder="e.g., Sofia Perez" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="age" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Age</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                name={field.name}
                                onBlur={field.onBlur}
                                ref={field.ref}
                                value={typeof field.value === 'number' ? field.value : ''}
                                onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="location" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location (City, State)</FormLabel>
                            <FormControl><Input placeholder="e.g., Madrid, Spain" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    )}
                     {currentStep === 2 && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Tell us a little more about your situation.</p>
                        { (selectedRole === 'parent' || selectedRole === 'reciprocal') && 
                            <>
                              <FormField control={form.control} name="numberOfChildren" render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Number of children</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      name={field.name}
                                      onBlur={field.onBlur}
                                      ref={field.ref}
                                      value={typeof field.value === 'number' ? field.value : ''}
                                      onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)}
                                      placeholder="e.g., 2"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} />
                              <FormField control={form.control} name="childAge" render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Age of your youngest child</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      name={field.name}
                                      onBlur={field.onBlur}
                                      ref={field.ref}
                                      value={typeof field.value === 'number' ? field.value : ''}
                                      onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)}
                                      placeholder="e.g., 5"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} />
                            </>
                        }
                        
                        <FormField control={form.control} name="workplace" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Workplace / Profession (Optional)</FormLabel>
                            <FormControl><Input placeholder="e.g., Nurse at City Hospital" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        
                        <FormField control={form.control} name="needs" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Your needs or what you offer</FormLabel>
                            <FormControl><Textarea placeholder="e.g., I work night shifts and need care for my 2-year-old..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    )}
                    {currentStep === 3 && (
                       <div className="space-y-4">
                          <FormField control={form.control} name="availability" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Availability</FormLabel>
                                <FormControl><Input placeholder="e.g., Weekends, weekday evenings" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                          )} />
                           <FormField control={form.control} name="interests" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Interests (comma separated)</FormLabel>
                                <FormControl><Input placeholder="e.g., Hiking, reading, board games" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                          )} />
                       </div>
                    )}
                    {currentStep === 4 && (
                      <div className="text-center">
                        <h3 className="text-lg font-semibold">One last step!</h3>
                        <p className="text-muted-foreground mt-2">Your profile is almost ready. You'll be redirected to upload photos and finalize your details.</p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="flex justify-between pt-4">
                  <button type="button" className="ss-btn-outline" onClick={handleBack} disabled={isSaving || currentStep === 0}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </button>
                  <button type="button" className="ss-btn" onClick={handleNext} disabled={isSaving}>
                    {isSaving ? 'Saving...' : (currentStep === totalSteps - 1 ? 'Finish & Add Photos' : 'Next')}
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
    )
}

