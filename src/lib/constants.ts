import { Home, MessageSquare, Calendar, User, Heart, Sparkles } from 'lucide-react';

export const APP_NAME = 'ShiftSitter Pro';

export const NAV_LINKS = [
  { href: '/families/match', label: 'Match', icon: Heart },
  { href: '/families/messages', label: 'Messages', icon: MessageSquare },
  { href: '/families/calendar', label: 'Calendar', icon: Calendar },
  { href: '/families/assistant', label: 'Assistant', icon: Sparkles },
  { href: '/families/profile', label: 'Profile', icon: User },
];

export const ONBOARDING_STEPS = [
    { id: 'step1', title: 'Your Role', fields: ['role'] },
    { id: 'step2', title: 'Welcome', fields: ['name', 'age', 'location'] },
    { id: 'step3', title: 'Your Details', fields: ['numberOfChildren', 'childAge', 'needs', 'workplace'] },
    { id: 'step4', title: 'Availability & Interests', fields: ['availability', 'interests'] },
    { id: 'step5', title: 'Profile Photos', fields: [] },
];
