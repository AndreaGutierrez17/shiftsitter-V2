import { MessageSquare, User, Heart, Calendar } from 'lucide-react';

export const APP_NAME = 'ShiftSitter Pro';

export const NAV_LINKS = [
  { href: '/families/match', label: 'Match', icon: Heart },
  { href: '/families/messages', label: 'Messages', icon: MessageSquare },
  { href: '/families/calendar', label: 'Calendar', icon: Calendar },
  { href: '/families/profile', label: 'Profile', icon: User },
];

export const ONBOARDING_STEPS = [
  { id: 'step1', title: 'Role', fields: ['role'] },
  { id: 'step2', title: 'Basics & Location', fields: ['name', 'age', 'state', 'city', 'zip', 'location'] },
  { id: 'step3', title: 'Family & Practical Details', fields: ['numberOfChildren', 'childAge', 'workplace', 'needs'] },
  { id: 'step4', title: 'Schedule & Safety', fields: ['daysNeeded', 'shiftsNeeded', 'availability', 'interestSelections', 'interestsOther', 'interests'] },
  { id: 'step5', title: 'Finish', fields: [] },
] as const;
