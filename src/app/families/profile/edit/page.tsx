'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Trash2, Upload, Loader2, AlertTriangle, BellRing, FileText, BadgeCheck, IdCard, Camera, Repeat } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { auth, db, storage } from '@/lib/firebase/client';
import { doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { enableWebPush } from '@/lib/firebase/push';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AuthGuard } from '@/components/AuthGuard';
import { FIND_SHIFTERS_LABEL } from '@/lib/constants';

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
  role: z.enum(['reciprocal'], { message: 'Please select a role.' }),
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  age: z.coerce.number().min(18, 'You must be at least 18 years old.'),
  location: z.string().optional(),
  state: z.string().optional(),
  city: z.string().trim().min(1, 'City is required.'),
  zip: z.string().trim().min(1, 'ZIP code is required.'),
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
  needZipWork: z.string().trim().min(1, 'Work ZIP code is required.'),
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
  if (data.needDays.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['needDays'], message: 'Please select at least one day you need care.' });
  }
  if (data.needShifts.length === 0) {
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
type VerificationUploadField = 'cv' | 'idFront' | 'selfie';

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeRole(value: unknown): ProfileFormValues['role'] {
  return value === 'reciprocal' ? value : 'reciprocal';
}

function normalizeSettingPreference(value: unknown): ProfileFormValues['needSettingPreference'] {
  return value === 'my_home' || value === 'their_home' || value === 'either' ? value : 'either';
}

function normalizeHandoffPreference(value: unknown): ProfileFormValues['needHandoffPreference'] {
  return value === 'pickup' || value === 'dropoff' || value === 'my_workplace' || value === 'their_workplace' || value === 'either'
    ? value
    : 'either';
}

function normalizePetsInHome(value: unknown): ProfileFormValues['needPetsInHome'] {
  return value === 'none' || value === 'dog' || value === 'cat' || value === 'multiple' || value === 'unknown'
    ? value
    : 'unknown';
}

function toggleArrayValue(currentValues: string[], value: string, checked: boolean) {
  if (checked) return currentValues.includes(value) ? currentValues : [...currentValues, value];
  return currentValues.filter((item) => item !== value);
}

function buildLocation(city?: string, state?: string, zip?: string) {
  const safeCity = city?.trim() ?? '';
  const safeState = state?.trim() ?? '';
  const safeZip = zip?.trim() ?? '';
  if (safeCity && safeState && safeZip) return `${safeCity}, ${safeState} ${safeZip}`;
  if (safeCity && safeState) return `${safeCity}, ${safeState}`;
  if (safeCity) return safeCity;
  if (safeState) return safeState;
  return safeZip;
}

function buildAvailabilitySummary(days: string[], shifts: string[]) {
  if (days.length === 0 && shifts.length === 0) return '';
  if (days.length === 0) return shifts.join(', ');
  if (shifts.length === 0) return days.join(', ');
  return `${days.join(', ')} (${shifts.join(', ')})`;
}

function buildRoleAvailabilitySummary(role: string | undefined, needDays: string[], needShifts: string[], offerDays: string[], offerShifts: string[]) {
  const useNeedSide = role === 'reciprocal';
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

const compressImageFile = async (file: File): Promise<File> => {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return file;
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) return file;

  const maxDimension = 800;
  const quality = 0.85;
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });

    if (!compressedBlob) return file;

    return new File(
      [compressedBlob],
      file.name.replace(/\.[^.]+$/, '.jpg'),
      { type: 'image/jpeg', lastModified: Date.now() }
    );
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};

export default function EditProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [photos, setPhotos] = useState<string[]>([]);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [idFrontUrl, setIdFrontUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<UserProfile['verificationStatus']>('unverified');
  const [verificationReviewNotes, setVerificationReviewNotes] = useState<string>('');
  const [isUploadingVerification, setIsUploadingVerification] = useState(false);
  const [uploadingVerificationField, setUploadingVerificationField] = useState<'cv' | 'idFront' | 'selfie' | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [replacingPhotoUrl, setReplacingPhotoUrl] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isHandlingNotifications, setIsHandlingNotifications] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      role: 'reciprocal',
      name: '',
      age: 18,
      location: '',
      state: '',
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
    const nextLocation = buildLocation(watchedCity, watchedState, watchedZip);
    if (form.getValues('location') !== nextLocation) form.setValue('location', nextLocation);
  }, [form, watchedCity, watchedState, watchedZip]);

  useEffect(() => {
    const nextAvailability = buildRoleAvailabilitySummary(selectedRoleWatch, watchedNeedDays, watchedNeedShifts, watchedOfferDays, watchedOfferShifts);
    if (form.getValues('availability') !== nextAvailability) form.setValue('availability', nextAvailability);
  }, [form, selectedRoleWatch, watchedNeedDays, watchedNeedShifts, watchedOfferDays, watchedOfferShifts]);

  useEffect(() => {
    const useNeedSide = selectedRoleWatch === 'reciprocal';
    const nextDays = useNeedSide ? watchedNeedDays : watchedOfferDays;
    const nextShifts = useNeedSide ? watchedNeedShifts : watchedOfferShifts;
    if (JSON.stringify(form.getValues('daysNeeded')) !== JSON.stringify(nextDays)) form.setValue('daysNeeded', nextDays);
    if (JSON.stringify(form.getValues('shiftsNeeded')) !== JSON.stringify(nextShifts)) form.setValue('shiftsNeeded', nextShifts);
  }, [form, selectedRoleWatch, watchedNeedDays, watchedNeedShifts, watchedOfferDays, watchedOfferShifts]);

  useEffect(() => {
    const nextInterests = buildInterestsSummary(watchedInterestSelections, watchedInterestsOther);
    if (form.getValues('interests') !== nextInterests) form.setValue('interests', nextInterests);
  }, [form, watchedInterestSelections, watchedInterestsOther]);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      setPageLoading(true);
      try {
        const userRef = doc(db, 'users', user.uid);
        const profileRef = doc(db, 'profiles', user.uid);
        const answersRef = doc(db, 'user_answers', user.uid);
        const [userDoc, profileDoc, answersDoc] = await Promise.all([
          getDoc(userRef),
          getDoc(profileRef),
          getDoc(answersRef),
        ]);

        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          const publicProfile = (profileDoc.exists() ? profileDoc.data() : {}) as Record<string, unknown>;
          const answers = ((answersDoc.exists() ? answersDoc.data()?.answers : {}) || {}) as Record<string, unknown>;
          const need = (typeof profile.need === 'object' && profile.need ? profile.need : {}) as Record<string, unknown>;
          const offer = (typeof profile.offer === 'object' && profile.offer ? profile.offer : {}) as Record<string, unknown>;
          const role = normalizeRole(profile.role ?? publicProfile.familyRole);
          const stateValue = asString(profile.state ?? publicProfile.state);
          const cityValue = asString(profile.city ?? publicProfile.city);
          const zipValue = asString(profile.zip ?? publicProfile.homeZip);
          const needDays = asStringArray(need.days ?? answers.need_days);
          const needShifts = asStringArray(need.shifts ?? answers.need_shifts);
          const offerDays = asStringArray(offer.days ?? answers.give_days);
          const offerShifts = asStringArray(offer.shifts ?? answers.give_shifts);
          const childrenAgesText =
            asString(profile.childrenAgesText) ||
            (Array.isArray(need.childrenAges) ? (need.childrenAges as unknown[]).join(', ') : '');
          const interestSelections = asStringArray(profile.interestSelections).length > 0
            ? asStringArray(profile.interestSelections)
            : asStringArray(answers.interests ?? profile.interests);
          const interestsOtherValue = asString(profile.interestsOther);
          const needChildrenCount = parseNumericText(String(need.childrenCount ?? profile.numberOfChildren ?? 1));
          const offerMaxChildrenTotal = parseNumericText(String(offer.maxChildrenTotal ?? Math.max(1, needChildrenCount || 1)));
          const travelMinutes = parseNumericText(String(need.maxTravelMinutes ?? offer.maxTravelMinutes ?? answers.travel_max_minutes ?? 30)) || 30;

          form.reset({
            role,
            name: profile.name,
            age: profile.age,
            location: profile.location || buildLocation(cityValue, stateValue, zipValue),
            state: stateValue,
            city: cityValue,
            zip: zipValue,
            workplace: profile.workplace || '',
            numberOfChildren: profile.numberOfChildren ?? undefined,
            childAge: profile.childAge ?? undefined,
            childrenAgesText,
            needs: profile.needs || '',
            offerSummary: profile.offerSummary || '',
            needDays,
            needShifts,
            needDurationBucket: asString(need.durationBucket) || '4-8',
            needSettingPreference: normalizeSettingPreference(need.settingPreference ?? answers.setting_need),
            needChildrenCount: String(Math.max(1, needChildrenCount || 1)),
            needSpecialNeeds: asBoolean((need.specialNeeds as { has?: boolean } | undefined)?.has),
            needSpecialNeedsNotes: asString((need.specialNeeds as { notes?: string } | undefined)?.notes),
            requireSmokeFree: asBoolean(need.requireSmokeFree ?? answers.smoke_free_required),
            needPetsInHome: normalizePetsInHome(need.petsInHome ?? answers.pets_in_home),
            needOkWithPets: asBoolean(need.okWithPets ?? answers.okay_with_pets),
            needZipWork: asString(
              need.zipWork ??
                answers.work_zip ??
                publicProfile.workZip ??
                need.zipHome ??
                answers.home_zip ??
                publicProfile.homeZip ??
                profile.zip
            ),
            needHandoffPreference: normalizeHandoffPreference(need.handoffPreference ?? answers.handoff_need),
            needMaxTravelMinutes: String(travelMinutes),
            needExtrasNeeded: asStringArray(need.extrasNeeded ?? answers.extras_need),
            offerDays,
            offerShifts,
            offerHoursPerMonthBucket: asString(offer.hoursPerMonthBucket) || '4-8',
            offerSettingPreference: normalizeSettingPreference(offer.settingPreference ?? answers.setting_offer),
            offerMaxChildrenTotal: String(Math.max(1, offerMaxChildrenTotal || 1)),
            offerAgeRanges: asStringArray(offer.ageRanges),
            offerOkWithSpecialNeeds: asBoolean(offer.okWithSpecialNeeds ?? profile.specialNeedsOk),
            offerHasVehicle: asBoolean(offer.hasVehicle ?? profile.drivingLicense),
            offerExtrasOffered: asStringArray(offer.extrasOffered ?? answers.extras_offer),
            daysNeeded: asStringArray(profile.daysNeeded),
            shiftsNeeded: asStringArray(profile.shiftsNeeded),
            availability: profile.availability || buildRoleAvailabilitySummary(role, needDays, needShifts, offerDays, offerShifts),
            interestSelections,
            interestsOther: interestsOtherValue,
            interests: profile.interestsText || buildInterestsSummary(interestSelections, interestsOtherValue),
            smokeFree: asBoolean(profile.smokeFree ?? answers.smoke_free ?? need.smokeFree ?? offer.smokeFree),
            petsOk: asBoolean(profile.petsOk ?? offer.okWithPets ?? need.okWithPets ?? answers.okay_with_pets),
          });

          const validPhotos = (profile.photoURLs || []).filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
          setPhotos(validPhotos);
          setCvUrl(profile.cvUrl || null);
          setIdFrontUrl(profile.idFrontUrl || null);
          setSelfieUrl(profile.selfieUrl || null);
          const reviewNotes =
            (profile as UserProfile & { rejectReason?: string }).rejectReason ||
            profile.verificationReviewNotes ||
            '';
          setVerificationReviewNotes(reviewNotes);
          setVerificationStatus(profile.verificationStatus ?? 'unverified');
        } else {
          if (user.displayName) form.setValue('name', user.displayName);
          if (user.photoURL) setPhotos([user.photoURL]);
        }
      } catch (error: any) {
        console.error('Profile fetch error:', error);
        toast({
          variant: 'destructive',
          title: 'Permission error',
          description: error?.message || 'Could not load the profile from Firebase.',
          duration: 9000,
        });
      } finally {
        setPageLoading(false);
      }
    };

    void fetchProfile();
  }, [form, toast, user]);

  const handleFileUpload = async (file: File): Promise<string> => {
    if (!user) throw new Error('User not authenticated.');

    let fileToUpload = file;

    if (file.type.startsWith('image/')) {
      try {
        fileToUpload = await compressImageFile(file);
      } catch (error) {
        console.error('Image compression error:', error);
        toast({
          title: 'Using original image',
          description: 'Your phone provided a format that could not be compressed in-browser, so we are uploading the original file instead.',
        });
      }
    } else if (file.size > 5 * 1024 * 1024) {
      throw new Error('File is too large. The limit is 5MB.');
    }

    const filePath = `user_photos/${user.uid}/${Date.now()}_${fileToUpload.name}`;
    const storageRef = ref(storage, filePath);
    const snapshot = await uploadBytes(storageRef, fileToUpload);
    return getDownloadURL(snapshot.ref);
  };

  const isAllowedVerificationFile = (file: File) => {
    if (file.type.startsWith('image/')) return true;
    const allowedTypes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    if (allowedTypes.has(file.type)) return true;
    const name = file.name.toLowerCase();
    return name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx');
  };

  const handleVerificationFileUpload = async (file: File, field: VerificationUploadField): Promise<string> => {
    if (!user) throw new Error('User not authenticated.');
    if (!isAllowedVerificationFile(file)) {
      throw new Error('Only images, PDF, DOC, or DOCX files are allowed.');
    }

    let fileToUpload = file;

    if (file.type.startsWith('image/')) {
      try {
        fileToUpload = await compressImageFile(file);
      } catch (error) {
        console.error('Image compression error:', error);
        toast({
          title: 'Using original image',
          description: 'Your phone provided a format that could not be compressed in-browser, so we are uploading the original file instead.',
        });
      }
    }

    const maxBytes = 8 * 1024 * 1024;
    if (fileToUpload.size > maxBytes) {
      throw new Error('File is too large. The limit is 8MB.');
    }

    const filePath = `verification_docs/${user.uid}/${field}_${Date.now()}_${fileToUpload.name}`;
    const storageRef = ref(storage, filePath);
    const snapshot = await uploadBytes(storageRef, fileToUpload);
    return getDownloadURL(snapshot.ref);
  };

  const handleVerificationUpload = async (field: VerificationUploadField, file: File) => {
    if (!user) return;

    setIsUploadingVerification(true);
    setUploadingVerificationField(field);

    const existingUrl = field === 'cv' ? cvUrl : field === 'idFront' ? idFrontUrl : selfieUrl;

    try {
      const downloadURL = await handleVerificationFileUpload(file, field);
      const payload: Record<string, unknown> = {
        verificationStatus: 'pending',
        verificationSubmittedAt: serverTimestamp(),
        verificationReviewedAt: null,
        verificationReviewNotes: '',
        rejectReason: '',
      };
      if (field === 'cv') payload.cvUrl = downloadURL;
      if (field === 'idFront') payload.idFrontUrl = downloadURL;
      if (field === 'selfie') payload.selfieUrl = downloadURL;

      await updateDoc(doc(db, 'users', user.uid), payload);

      if (field === 'cv') setCvUrl(downloadURL);
      if (field === 'idFront') setIdFrontUrl(downloadURL);
      if (field === 'selfie') setSelfieUrl(downloadURL);
      setVerificationStatus('pending');
      setVerificationReviewNotes('');

      if (existingUrl) {
        deleteObject(ref(storage, existingUrl)).catch(() => null);
      }

      toast({
        title: 'Document uploaded',
        description: 'Your verification is now pending review.',
      });
    } catch (error: any) {
      console.error('Verification upload error:', error);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error?.message || 'An unexpected error occurred while uploading your document.',
        duration: 9000,
      });
    } finally {
      setIsUploadingVerification(false);
      setUploadingVerificationField(null);
    }
  };

  const handleVerificationFileChange =
    (field: VerificationUploadField) => async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await handleVerificationUpload(field, file);
      event.target.value = '';
    };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!user || !file) return;

    setIsUploadingPhoto(true);

    try {
      const downloadURL = await handleFileUpload(file);
      const updatedPhotos = [downloadURL, ...photos.filter((url) => url !== downloadURL)];
      await updateDoc(doc(db, 'users', user.uid), { photoURLs: updatedPhotos });
      setPhotos(updatedPhotos);
      toast({ title: 'Photo uploaded successfully!', description: 'Your new photo is now the main profile photo.' });
    } catch (error: any) {
      console.error('Photo Upload Error:', error);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error?.message || 'An unexpected error occurred while uploading the photo.',
        duration: 9000,
      });
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handlePhotoDelete = async (urlToDelete: string) => {
    if (!user) return;
    if (photos.length <= 1) {
      toast({ variant: 'destructive', title: 'Cannot delete', description: 'You must have at least one photo.' });
      return;
    }

    const originalPhotos = photos;
    const updatedPhotos = photos.filter((url) => url !== urlToDelete);
    setPhotos(updatedPhotos);

    try {
      await updateDoc(doc(db, 'users', user.uid), { photoURLs: updatedPhotos });
      await deleteObject(ref(storage, urlToDelete));
      toast({ title: 'Photo deleted' });
    } catch (error) {
      console.error('Photo delete error:', error);
      setPhotos(originalPhotos);
      toast({ variant: 'destructive', title: 'Error deleting photo', description: 'Could not delete photo from storage. Please try again.' });
    }
  };

  const handleSetPrimaryPhoto = async (urlToSetPrimary: string) => {
    if (!user || photos.length === 0 || photos[0] === urlToSetPrimary) return;

    const reordered = [urlToSetPrimary, ...photos.filter((url) => url !== urlToSetPrimary)];
    const original = photos;
    setPhotos(reordered);

    try {
      await updateDoc(doc(db, 'users', user.uid), { photoURLs: reordered });
      toast({ title: 'Main photo updated' });
    } catch (error: any) {
      console.error('Set primary photo error:', error);
      setPhotos(original);
      toast({
        variant: 'destructive',
        title: 'Could not update main photo',
        description: error?.message || 'Please try again.',
      });
    }
  };

  const handlePhotoReplace = async (urlToReplace: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!user || !file) return;

    setIsUploadingPhoto(true);
    setReplacingPhotoUrl(urlToReplace);
    const originalPhotos = photos;

    try {
      const downloadURL = await handleFileUpload(file);
      const updatedPhotos = photos.map((url) => (url === urlToReplace ? downloadURL : url));
      await updateDoc(doc(db, 'users', user.uid), { photoURLs: updatedPhotos });
      setPhotos(updatedPhotos);

      try {
        await deleteObject(ref(storage, urlToReplace));
      } catch (deleteError) {
        console.warn('Old photo cleanup failed after replace:', deleteError);
      }

      toast({ title: 'Photo replaced successfully!' });
    } catch (error: any) {
      console.error('Photo Replace Error:', error);
      setPhotos(originalPhotos);
      toast({
        variant: 'destructive',
        title: 'Replace Failed',
        description: error?.message || 'An unexpected error occurred while replacing the photo.',
        duration: 9000,
      });
    } finally {
      setIsUploadingPhoto(false);
      setReplacingPhotoUrl(null);
      e.target.value = '';
    }
  };

  async function onSubmit(values: ProfileFormValues) {
    if (!user) return;
    setIsSaving(true);

    try {
      const userRef = doc(db, 'users', user.uid);
      const profileRef = doc(db, 'profiles', user.uid);
      const answersRef = doc(db, 'user_answers', user.uid);
      const currentPhoto = photos[0] || user.photoURL || null;
      const currentPhotos = photos.length > 0 ? photos : (user.photoURL ? [user.photoURL] : []);
      const interestsArray = values.interests.split(',').map((item) => item.trim()).filter(Boolean);
      const childrenAges = parseChildrenAges(values.childrenAgesText);
      const normalizedChildrenCount = parseNumericText(values.needChildrenCount);
      const normalizedOfferCapacity = parseNumericText(values.offerMaxChildrenTotal);
      const normalizedTravelMinutes = parseNumericText(values.needMaxTravelMinutes) || 30;
      const normalizedNeedZipHome = values.zip?.trim() || '';
      const normalizedNeedZipWork = values.needZipWork?.trim() || values.zip?.trim() || '';
      const resolvedLocation = values.location || buildLocation(values.city, values.state, values.zip);
      const needDays = values.needDays;
      const needShifts = values.needShifts;
      const offerDays = values.offerDays;
      const offerShifts = values.offerShifts;
      const need = {
        days: needDays,
        shifts: needShifts,
        durationBucket: values.needDurationBucket,
        settingPreference: values.needSettingPreference,
        childrenCount: normalizedChildrenCount,
        childrenAges,
        specialNeeds: {
          has: values.needSpecialNeeds ?? false,
          notes: values.needSpecialNeedsNotes?.trim() || '',
        },
        smokeFree: values.smokeFree ?? false,
        requireSmokeFree: values.requireSmokeFree ?? false,
        petsInHome: values.needPetsInHome,
        okWithPets: values.needOkWithPets ?? false,
        zipHome: normalizedNeedZipHome,
        zipWork: normalizedNeedZipWork,
        handoffPreference: values.needHandoffPreference,
        maxTravelMinutes: normalizedTravelMinutes,
        extrasNeeded: values.needExtrasNeeded,
      };
      const offer = {
        days: offerDays,
        shifts: offerShifts,
        hoursPerMonthBucket: values.offerHoursPerMonthBucket,
        settingPreference: values.offerSettingPreference,
        maxChildrenTotal: Math.max(1, normalizedOfferCapacity || normalizedChildrenCount || 1),
        ageRanges: values.offerAgeRanges,
        okWithSpecialNeeds: values.offerOkWithSpecialNeeds ?? false,
        hasVehicle: values.offerHasVehicle ?? false,
        extrasOffered: values.offerExtrasOffered,
        smokeFree: values.smokeFree ?? false,
        okWithPets: values.petsOk ?? false,
        zipHome: normalizedNeedZipHome,
        zipWork: normalizedNeedZipWork,
        handoffPreference: values.needHandoffPreference,
        maxTravelMinutes: normalizedTravelMinutes,
      };
      const publicProfile = {
        uid: user.uid,
        role: 'family',
        familyRole: values.role,
        displayName: values.name,
        photoURL: currentPhoto,
        photoURLs: currentPhotos,
        homeZip: normalizedNeedZipHome,
        workZip: normalizedNeedZipWork,
        state: values.state?.trim() || '',
        city: values.city?.trim() || '',
        location: resolvedLocation,
        onboardingComplete: true,
        updatedAt: serverTimestamp(),
      };
      const answers = {
        family_role: values.role,
        need_days: needDays,
        need_shifts: needShifts,
        give_days: offerDays,
        give_shifts: offerShifts,
        extras_need: values.needExtrasNeeded,
        extras_offer: values.offerExtrasOffered,
        smoke_free_required: values.requireSmokeFree ?? false,
        smoke_free: values.smokeFree ?? false,
        pets_in_home: values.needPetsInHome,
        okay_with_pets: values.needOkWithPets ?? false,
        setting_need: values.needSettingPreference,
        setting_offer: values.offerSettingPreference,
        handoff_need: values.needHandoffPreference,
        handoff_offer: values.needHandoffPreference,
        travel_max_minutes: normalizedTravelMinutes,
        home_zip: normalizedNeedZipHome,
        work_zip: normalizedNeedZipWork,
        interests: interestsArray,
      };
      const userProfile = {
        id: user.uid,
        uid: user.uid,
        email: user.email,
        name: values.name,
        photoURLs: currentPhotos,
        profileComplete: true,
        accountType: 'family',
        age: values.age,
        role: values.role,
        location: resolvedLocation,
        state: values.state?.trim() || '',
        city: values.city?.trim() || '',
        zip: values.zip?.trim() || '',
        workplace: values.workplace || '',
        numberOfChildren: normalizedChildrenCount || null,
        childAge: values.childAge ?? null,
        childrenAgesText: values.childrenAgesText?.trim() || '',
        needs: values.needs?.trim() || '',
        offerSummary: values.offerSummary?.trim() || '',
        daysNeeded: needDays,
        shiftsNeeded: needShifts,
        availability: values.availability,
        interestSelections: values.interestSelections,
        interestsOther: values.interestsOther?.trim() || '',
        interestsText: values.interests,
        interests: interestsArray,
        smokeFree: values.smokeFree ?? false,
        petsOk: values.needOkWithPets ?? false,
        drivingLicense: values.offerHasVehicle ?? false,
        specialNeedsOk: values.offerOkWithSpecialNeeds ?? false,
        need,
        offer,
        onboardingComplete: true,
        access: {
          source: 'manual',
          status: 'active',
          updatedAt: serverTimestamp(),
          notes: 'Profile updated from Edit Profile.',
        },
        updatedAt: serverTimestamp(),
      };

      const batch = writeBatch(db);
      batch.set(userRef, userProfile, { merge: true });
      batch.set(profileRef, publicProfile, { merge: true });
      batch.set(
        answersRef,
        {
          uid: user.uid,
          answers,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();
      toast({
        title: 'Profile Updated',
        description: 'Your changes have been saved successfully.',
      });
      router.push(`/families/profile/${user.uid}`);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error updating profile',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  const handleDeleteAccount = async () => {
    if (!user) return;
    setIsDeleting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== user.uid) {
        throw new Error('You must be signed in to delete your account.');
      }

      const safeDelete = (url: string) => {
        if (!url || !url.includes('firebasestorage.googleapis.com')) return Promise.resolve();
        try {
          return deleteObject(ref(storage, url));
        } catch {
          return Promise.resolve();
        }
      };

      await Promise.allSettled([
        ...photos.map(safeDelete),
        ...(cvUrl ? [safeDelete(cvUrl)] : []),
        ...(idFrontUrl ? [safeDelete(idFrontUrl)] : []),
        ...(selfieUrl ? [safeDelete(selfieUrl)] : []),
      ]);

      const idToken = await currentUser.getIdToken(true);
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) {
        throw new Error(payload.error || 'Could not delete your account.');
      }

      await signOut(auth);

      toast({
        title: 'Account Deleted',
        description: 'Your account and all your data have been permanently deleted.',
      });

      router.push('/');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast({
        variant: 'destructive',
        title: 'Error Deleting Account',
        description: error?.message || 'An unexpected error occurred. Please try again.',
        duration: 9000,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEnableNotifications = async () => {
    setIsHandlingNotifications(true);
    try {
      if (!user) throw new Error('You must be logged in.');
      await enableWebPush(user.uid);
      toast({
        title: 'Notifications enabled',
        description: 'Push notifications were activated successfully.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not enable notifications',
        description: error?.message || 'Please check your browser permissions and try again.',
      });
    } finally {
      setIsHandlingNotifications(false);
    }
  };

  if (pageLoading || authLoading) {
    return (
      <div className="container mx-auto max-w-4xl p-4 md:p-8">
        <Card>
          <CardHeader>
            <Skeleton className="h-9 w-1/2" />
            <Skeleton className="h-5 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-8">
            <Skeleton className="h-40 w-full" />
            <Separator />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isBusy =
    isSaving ||
    isUploadingPhoto ||
    isUploadingVerification ||
    isDeleting ||
    isHandlingNotifications;

  const verificationStatusLabel =
    verificationStatus === 'verified'
      ? 'Accepted'
      : verificationStatus === 'pending'
        ? 'Pending'
        : verificationStatus === 'rejected'
          ? 'Rejected'
          : 'Unverified';

  const verificationStatusTone =
    verificationStatus === 'verified'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : verificationStatus === 'pending'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : verificationStatus === 'rejected'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-slate-50 text-slate-600';

  const verificationStatusMessage =
    verificationStatus === 'verified'
      ? 'Your documents have been approved.'
      : verificationStatus === 'pending'
        ? 'Your documents are in review.'
        : verificationStatus === 'rejected'
          ? 'Your submission was rejected. Please upload new documents.'
          : 'Upload your documents to start verification.';

  const isMobileDevice =
    typeof window !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const verificationItems: Array<{
    key: VerificationUploadField;
    label: string;
    hint: string;
    accept: string;
    capture?: boolean | 'user' | 'environment';
    url: string | null;
    icon: typeof FileText;
  }> = [
    {
      key: 'idFront',
      label: 'Government ID (front)',
      hint: 'Required',
      accept: 'image/*,application/pdf',
      url: idFrontUrl,
      icon: IdCard,
    },
    {
      key: 'selfie',
      label: 'Selfie',
      hint: 'Required',
      accept: 'image/*',
      capture: isMobileDevice ? 'user' : undefined,
      url: selfieUrl,
      icon: Camera,
    },
    {
      key: 'cv',
      label: 'CV or resume',
      hint: 'Optional',
      accept: '.pdf,.doc,.docx',
      url: cvUrl,
      icon: FileText,
    },
  ];

  return (
    <AuthGuard>
      <div className="container mx-auto max-w-4xl p-4 md:p-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <fieldset disabled={isBusy} className="group">
              <Card className="group-disabled:opacity-50">
                <CardHeader>
                  <CardTitle className="font-headline text-3xl">Edit Your Profile</CardTitle>
                  <CardDescription>Keep your information up-to-date to get the best matches.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Card className="shadow-md">
                    <CardContent className="p-5">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">Your Photos</h3>
                        <p className="mb-4 text-sm text-muted-foreground">The first photo is your main profile picture. You can have up to 5 photos.</p>
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                          {photos.map((url, index) => (
                            <div key={url} className="relative aspect-square overflow-hidden rounded-lg border group/photo">
                              <Image src={url} alt={`Photo ${index + 1}`} fill className="object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 p-2 opacity-0 transition-opacity group-hover/photo:opacity-100">
                                {index !== 0 ? (
                                  <Button type="button" variant="secondary" size="sm" onClick={() => handleSetPrimaryPhoto(url)}>
                                    Set main
                                  </Button>
                                ) : null}
                                <label className="inline-flex">
                                  <span className="sr-only">Replace photo</span>
                                  <input
                                    type="file"
                                    className="sr-only"
                                    onChange={(e) => handlePhotoReplace(url, e)}
                                    accept="image/*"
                                    disabled={isUploadingPhoto}
                                  />
                                  <Button type="button" variant="secondary" size="sm" asChild disabled={isUploadingPhoto}>
                                    <span>{replacingPhotoUrl === url ? 'Replacing...' : 'Replace'}</span>
                                  </Button>
                                </label>
                                <Button type="button" variant="destructive" size="icon" onClick={() => handlePhotoDelete(url)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              {index === 0 ? (
                                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                                  Primary
                                </div>
                              ) : null}
                            </div>
                          ))}
                          {photos.length < 5 ? (
                            <label className={cn('relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed hover:bg-accent', isUploadingPhoto && 'cursor-not-allowed')}>
                              {isUploadingPhoto ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
                              <span className="mt-1 text-xs text-muted-foreground">{isUploadingPhoto ? 'Uploading...' : 'Upload'}</span>
                              <input type="file" className="sr-only" onChange={handlePhotoUpload} accept="image/*" disabled={isUploadingPhoto} />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-md" data-tour="profile-verification">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">Verification and documents</h3>
                          <p className="mb-4 text-sm text-muted-foreground">
                            Upload your ID and selfie to request verification. Status updates and notifications will arrive once reviewed.
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${verificationStatusTone}`}>
                          <BadgeCheck className="h-4 w-4" />
                          {verificationStatusLabel}
                        </span>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-slate-50 p-4 text-sm text-slate-700">
                        <p className="font-semibold">Verification status</p>
                        <p className="mt-1">{verificationStatusMessage}</p>
                        {verificationStatus === 'rejected' && verificationReviewNotes ? (
                          <p className="mt-2 text-rose-700">Review notes: {verificationReviewNotes}</p>
                        ) : null}
                      </div>
                      <div className="mt-4 space-y-3">
                        {verificationItems.map((item) => {
                          const Icon = item.icon;
                          const isUploadingItem = isUploadingVerification && uploadingVerificationField === item.key;
                          const inputId = `verification-${item.key}`;
                          return (
                            <div key={item.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-white p-4">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 rounded-full border bg-slate-50 p-2">
                                  <Icon className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{item.label}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.hint} · {item.url ? 'Uploaded' : 'Not uploaded'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {item.url ? (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                                  >
                                    View
                                  </a>
                                ) : null}
                                <input
                                  id={inputId}
                                  type="file"
                                  className="sr-only"
                                  accept={item.accept}
                                  capture={item.capture}
                                  onChange={handleVerificationFileChange(item.key)}
                                  disabled={isUploadingVerification}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  asChild
                                  disabled={isUploadingVerification}
                                >
                                  <label
                                    htmlFor={inputId}
                                    className={cn(isUploadingVerification && !isUploadingItem && 'pointer-events-none opacity-60')}
                                  >
                                    {isUploadingItem ? 'Uploading...' : item.url ? 'Replace' : 'Upload'}
                                  </label>
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-md" lang="en" translate="no">
                    <CardHeader>
                      <CardTitle className="font-headline text-xl flex items-center gap-2">
                        <BellRing className="text-primary" />
                        Stay in the loop
                      </CardTitle>
                      <CardDescription>
                        Turn on alerts so you do not miss messages, matches, shift changes, or reviews.
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="bg-slate-50 pt-4 pb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        Browser alerts help you keep up with important updates in real time.
                      </p>
                      <Button type="button" onClick={handleEnableNotifications} disabled={isHandlingNotifications}>
                        <span className="inline-flex min-w-4 items-center justify-center">
                          {isHandlingNotifications ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        </span>
                        <span>{isHandlingNotifications ? 'Working...' : 'Turn On Alerts'}</span>
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className="shadow-md">
                    <CardHeader>
                      <CardTitle className="font-headline text-xl">Edit onboarding details</CardTitle>
                      <CardDescription>
                        Update every answer used by {FIND_SHIFTERS_LABEL}, your profile, and your availability without repeating onboarding.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8 p-5">
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-foreground">Basic profile</h3>
                        <FormField
                          control={form.control}
                          name="role"
                          render={({ field }) => (
                            <FormItem className="space-y-3">
                              <FormLabel>Main goal *</FormLabel>
                              <FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col gap-2">
                                  <FormItem className={`flex items-center space-x-3 space-y-0 rounded-xl border p-4 transition-colors ${field.value === 'reciprocal' ? 'border-primary/50 bg-accent' : 'bg-white hover:bg-accent/40'}`}>
                                    <FormControl><RadioGroupItem value="reciprocal" /></FormControl>
                                    <FormLabel className="flex cursor-pointer items-center gap-3 font-normal">
                                      <Repeat className="text-primary" />
                                      I am a parent looking for reciprocal childcare exchanges
                                    </FormLabel>
                                  </FormItem>
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <FormField control={form.control} name="name" render={({ field }) => (
                            <FormItem><FormLabel>Full name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
                                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : +e.target.value)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                          <FormField control={form.control} name="state" render={({ field }) => (
                            <FormItem>
                              <FormLabel>State / Region (optional)</FormLabel>
                              <Select value={field.value || undefined} onValueChange={field.onChange}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select if applicable" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  {US_STATE_OPTIONS.map((stateCode) => (
                                    <SelectItem key={stateCode} value={stateCode}>{stateCode}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="city" render={({ field }) => (
                            <FormItem><FormLabel>City *</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="zip" render={({ field }) => (
                            <FormItem><FormLabel>ZIP / Postal code *</FormLabel><FormControl><Input maxLength={12} {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <FormField control={form.control} name="location" render={({ field }) => (
                            <FormItem><FormLabel>Location summary</FormLabel><FormControl><Input {...field} value={field.value ?? ''} readOnly /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="workplace" render={({ field }) => (
                            <FormItem><FormLabel>Workplace / Profession (optional)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                          <FormField control={form.control} name="numberOfChildren" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Number of children (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  name={field.name}
                                  onBlur={field.onBlur}
                                  ref={field.ref}
                                  value={typeof field.value === 'number' ? field.value : ''}
                                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : +e.target.value)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="childAge" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Primary child age (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  name={field.name}
                                  onBlur={field.onBlur}
                                  ref={field.ref}
                                  value={typeof field.value === 'number' ? field.value : ''}
                                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : +e.target.value)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="childrenAgesText" render={({ field }) => (
                            <FormItem><FormLabel>Ages of children (optional)</FormLabel><FormControl><Input placeholder="e.g., 2, 5, 9" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>

                        <div className="space-y-6">
                          <h3 className="text-lg font-semibold text-foreground">What you need</h3>
                          <FormField control={form.control} name="needDays" render={({ field }) => (
                            <FormItem>
                          <FormLabel>Which days do you typically need childcare?</FormLabel>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {DAY_OPTIONS.map((day) => {
                              const selected = (field.value ?? []).includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  className={`ss-choice-btn ${selected ? 'is-selected' : ''}`}
                                  aria-pressed={selected}
                                  onClick={() => field.onChange(toggleArrayValue(field.value ?? [], day, !selected))}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                          <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name="needShifts" render={({ field }) => (
                            <FormItem>
                          <FormLabel>Which shifts do you need help with?</FormLabel>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {SHIFT_OPTIONS.map((shift) => {
                              const selected = (field.value ?? []).includes(shift);
                              return (
                                <button
                                  key={shift}
                                  type="button"
                                  className={`ss-choice-btn ${selected ? 'is-selected' : ''}`}
                                  aria-pressed={selected}
                                  onClick={() => field.onChange(toggleArrayValue(field.value ?? [], shift, !selected))}
                                >
                                  {shift}
                                </button>
                              );
                            })}
                          </div>
                          <FormMessage />
                            </FormItem>
                          )} />

                          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
                                <FormLabel>Preferred care setting</FormLabel>
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
                            <FormField control={form.control} name="needChildrenCount" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Children needing care</FormLabel>
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
                          </div>

                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <FormField control={form.control} name="needZipWork" render={({ field }) => (
                              <FormItem><FormLabel>Work ZIP / Postal code *</FormLabel><FormControl><Input maxLength={12} {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </div>

                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <FormField control={form.control} name="needHandoffPreference" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Preferred handoff location</FormLabel>
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
                                <FormLabel>Maximum travel time</FormLabel>
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

                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                            <FormField control={form.control} name="needSpecialNeedsNotes" render={({ field }) => (
                              <FormItem><FormLabel>Special considerations notes (optional)</FormLabel><FormControl><Textarea placeholder="Short note about routines or care considerations." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </div>

                          <div className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
                            <FormField control={form.control} name="needSpecialNeeds" render={({ field }) => (
                              <FormItem className="flex items-center justify-between space-y-0">
                                <FormLabel className="font-normal">Special considerations or specific needs</FormLabel>
                                <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="requireSmokeFree" render={({ field }) => (
                              <FormItem className="flex items-center justify-between space-y-0">
                                <FormLabel className="font-normal">Require a smoke-free match</FormLabel>
                                <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="needOkWithPets" render={({ field }) => (
                              <FormItem className="flex items-center justify-between space-y-0">
                                <FormLabel className="font-normal">Okay with pets</FormLabel>
                                <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="smokeFree" render={({ field }) => (
                              <FormItem className="flex items-center justify-between space-y-0">
                                <FormLabel className="font-normal">My home is smoke-free</FormLabel>
                                <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                              </FormItem>
                            )} />
                          </div>

                          <FormField control={form.control} name="needExtrasNeeded" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Extras you need help with</FormLabel>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {EXTRA_OPTIONS.map((extra) => {
                                  const selected = (field.value ?? []).includes(extra);
                                  return (
                                    <label key={extra} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
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

                        <div className="space-y-6">
                          <h3 className="text-lg font-semibold text-foreground">What you offer</h3>
                          <FormField control={form.control} name="offerDays" render={({ field }) => (
                            <FormItem>
                          <FormLabel>Which days can you provide care?</FormLabel>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {DAY_OPTIONS.map((day) => {
                              const selected = (field.value ?? []).includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  className={`ss-choice-btn ${selected ? 'is-selected' : ''}`}
                                  aria-pressed={selected}
                                  onClick={() => field.onChange(toggleArrayValue(field.value ?? [], day, !selected))}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                          <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name="offerShifts" render={({ field }) => (
                            <FormItem>
                          <FormLabel>Which shifts can you cover?</FormLabel>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {SHIFT_OPTIONS.map((shift) => {
                              const selected = (field.value ?? []).includes(shift);
                              return (
                                <button
                                  key={shift}
                                  type="button"
                                  className={`ss-choice-btn ${selected ? 'is-selected' : ''}`}
                                  aria-pressed={selected}
                                  onClick={() => field.onChange(toggleArrayValue(field.value ?? [], shift, !selected))}
                                >
                                  {shift}
                                </button>
                              );
                            })}
                          </div>
                          <FormMessage />
                            </FormItem>
                          )} />

                          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                            <FormField control={form.control} name="offerHoursPerMonthBucket" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Hours you can give per month</FormLabel>
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
                                <FormLabel>Where can you provide care?</FormLabel>
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
                            <FormField control={form.control} name="offerMaxChildrenTotal" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Total children you can supervise</FormLabel>
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
                          </div>

                          <div className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
                            <FormField control={form.control} name="offerHasVehicle" render={({ field }) => (
                              <FormItem className="flex items-center justify-between space-y-0">
                                <FormLabel className="font-normal">I have my own vehicle</FormLabel>
                                <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="offerOkWithSpecialNeeds" render={({ field }) => (
                              <FormItem className="flex items-center justify-between space-y-0">
                                <FormLabel className="font-normal">Comfortable caring for children with special needs</FormLabel>
                                <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="petsOk" render={({ field }) => (
                              <FormItem className="flex items-center justify-between space-y-0">
                                <FormLabel className="font-normal">Comfortable with pets in another home</FormLabel>
                                <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                              </FormItem>
                            )} />
                          </div>

                          <FormField control={form.control} name="offerAgeRanges" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Age ranges you can support</FormLabel>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {AGE_RANGE_OPTIONS.map((range) => {
                                  const selected = (field.value ?? []).includes(range);
                                  return (
                                    <label key={range} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                      <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], range, checked === true))} />
                                      <span>{range}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name="offerExtrasOffered" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Extras you are willing to offer</FormLabel>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {EXTRA_OPTIONS.map((extra) => {
                                  const selected = (field.value ?? []).includes(extra);
                                  return (
                                    <label key={extra} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
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

                        <div className="space-y-6">
                          <h3 className="text-lg font-semibold text-foreground">Profile summaries and interests</h3>
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <FormField control={form.control} name="availability" render={({ field }) => (
                              <FormItem><FormLabel>Availability summary</FormLabel><FormControl><Input {...field} value={field.value ?? ''} readOnly /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="interests" render={({ field }) => (
                              <FormItem><FormLabel>Interests summary</FormLabel><FormControl><Input {...field} value={field.value ?? ''} readOnly /></FormControl><FormMessage /></FormItem>
                            )} />
                          </div>

                          <FormField control={form.control} name="needs" render={({ field }) => (
                            <FormItem><FormLabel>Need summary</FormLabel><FormControl><Textarea placeholder="Briefly describe the support you need." rows={4} {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="offerSummary" render={({ field }) => (
                            <FormItem><FormLabel>Offer summary</FormLabel><FormControl><Textarea placeholder="Describe what you can offer back." rows={4} {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                          )} />

                          <FormField control={form.control} name="interestSelections" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Interests</FormLabel>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {INTEREST_OPTIONS.map((interest) => {
                                  const selected = (field.value ?? []).includes(interest);
                                  return (
                                    <label key={interest} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm ${selected ? 'border-primary/50 bg-accent' : ''}`}>
                                      <Checkbox checked={selected} onCheckedChange={(checked) => field.onChange(toggleArrayValue(field.value ?? [], interest, checked === true))} />
                                      <span>{interest}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name="interestsOther" render={({ field }) => (
                            <FormItem><FormLabel>Other interest (optional)</FormLabel><FormControl><Input placeholder="e.g., Bilingual care" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
                <CardFooter className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={() => router.push(`/families/profile/${user?.uid}`)}>Cancel</Button>
                  <Button type="submit">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </CardFooter>
              </Card>
            </fieldset>
          </form>
        </Form>

        <Separator className="my-8" />

        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive font-headline flex items-center gap-2">
              <AlertTriangle />
              Danger Zone
            </CardTitle>
            <CardDescription>
              This action is permanent and cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              Deleting your account will permanently remove all your information, including your profile, photos, messages, and matches from our systems.
            </p>
          </CardContent>
          <CardFooter className="bg-destructive/10 pt-6">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isBusy}>
                  {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  {isDeleting ? 'Deleting Account...' : 'Permanently Delete My Account'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your account and remove all of your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount} className={cn(buttonVariants({ variant: 'destructive' }))}>
                    Yes, delete my account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      </div>
    </AuthGuard>
  );
}
