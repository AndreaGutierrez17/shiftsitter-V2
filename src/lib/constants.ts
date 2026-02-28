import { MessageSquare, User, Heart, Calendar, Sparkles } from 'lucide-react';

export const APP_NAME = 'ShiftSitter Pro';

export const NAV_LINKS = [
  { href: '/families/match', label: 'Match', icon: Heart },
  { href: '/families/messages', label: 'Messages', icon: MessageSquare },
  { href: '/families/calendar', label: 'Calendar', icon: Calendar },
  { href: '/families/assistant', label: 'Assistant', icon: Sparkles },
  { href: '/families/profile', label: 'Profile', icon: User },
];

export const EMPLOYER_NAV_LINKS = [
  { href: '/employers/dashboard', label: 'Dashboard', icon: Heart },
  { href: '/employers/codes', label: 'Codes', icon: MessageSquare },
  { href: '/employers/settings', label: 'Settings', icon: User },
];

export const ONBOARDING_STEPS = [
  { id: 'step1', title: 'Role', fields: ['role'] },
  { id: 'step2', title: 'Basics & Location', fields: ['name', 'age', 'state', 'city', 'zip', 'location'] },
  { id: 'step3', title: 'What You Need', fields: ['needDays', 'needShifts', 'needChildrenCount', 'needZipHome'] },
  { id: 'step4', title: 'What You Offer', fields: ['offerDays', 'offerShifts', 'offerHoursPerMonthBucket', 'offerMaxChildrenTotal'] },
  { id: 'step5', title: 'Preferences & Extras', fields: ['interestSelections', 'interestsOther', 'interests'] },
  { id: 'step6', title: 'Summary', fields: [] },
] as const;
