import { MessageSquare, User, Heart, Calendar, Sparkles } from 'lucide-react';
import type { UserProfile } from '@/lib/types';

export const APP_NAME = 'ShiftSitter Pro';
export const FIND_SHIFTERS_LABEL = 'Find Shifters';
export const BETA_AUTO_VERIFY_USERS = false;
export const VERIFICATION_COMING_SOON_TITLE = 'Coming Soon';
export const VERIFICATION_COMING_SOON_MESSAGE =
  'Verification features will be enabled in a future update.';
export const VERIFICATION_COMING_SOON_NOTE =
  'For now, your account will remain active while we complete testing.';

type BetaVerificationProfile = Pick<UserProfile, 'isDemo' | 'verificationStatus'> | null | undefined;

export function isUserVerifiedForBeta(profile: BetaVerificationProfile) {
  if (!profile) return false;
  return profile.isDemo || BETA_AUTO_VERIFY_USERS || profile.verificationStatus === 'verified';
}

export function getVisibleVerificationStatus(
  status?: UserProfile['verificationStatus']
): UserProfile['verificationStatus'] {
  return BETA_AUTO_VERIFY_USERS ? 'verified' : status ?? 'unverified';
}

export const NAV_LINKS = [
  { href: '/families/match', label: FIND_SHIFTERS_LABEL, icon: Heart },
  { href: '/families/messages', label: 'Messages', icon: MessageSquare },
  { href: '/families/calendar', label: 'Calendar', icon: Calendar },
  { href: '/families/assistant', label: 'Assistant', icon: Sparkles },
  { href: '/families/profile', label: 'Profile', icon: User },
];

export const EMPLOYER_NAV_LINKS = [
  { href: '/employers/dashboard', label: 'Dashboard', icon: Heart },
  { href: '/employers/codes', label: 'Codes', icon: MessageSquare },
  { href: '/employers/settings', label: 'Company Profile', icon: User },
];

export const ONBOARDING_STEPS = [
  { id: 'step1', title: 'Role', fields: ['role'] },
  { id: 'step2', title: 'Basics & Location', fields: ['name', 'age', 'state', 'city', 'zip', 'location'] },
  { id: 'step3', title: 'What You Need', fields: ['needDays', 'needShifts', 'needChildrenCount', 'needZipWork'] },
  { id: 'step4', title: 'What You Offer', fields: ['offerDays', 'offerShifts', 'offerHoursPerMonthBucket', 'offerMaxChildrenTotal'] },
  { id: 'step5', title: 'Preferences & Extras', fields: ['interestSelections', 'interestsOther', 'interests'] },
  { id: 'step6', title: 'Summary', fields: [] },
] as const;
