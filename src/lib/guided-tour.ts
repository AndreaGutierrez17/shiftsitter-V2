export type GuidedTourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

type GuidedTourRouteMatcher = RegExp | ((pathname: string) => boolean);

export type GuidedTourStep = {
  id: string;
  title: string;
  description: string;
  route: string;
  routeMatcher: GuidedTourRouteMatcher;
  selector?: string;
  placement?: GuidedTourPlacement;
};

export const GUIDED_TOUR_STORAGE_KEY = 'shiftsitter:guided-tour-state';
export const GUIDED_TOUR_OPEN_EVENT = 'shiftsitter:guided-tour:open';

const guidedTourPathMatchers = [
  /^\/families\/match$/,
  /^\/families\/matches$/,
  /^\/families\/messages$/,
  /^\/families\/messages\/[^/]+$/,
  /^\/families\/calendar$/,
  /^\/families\/assistant$/,
  /^\/families\/profile$/,
  /^\/families\/profile\/edit$/,
  /^\/families\/profile\/[^/]+$/,
];

export function isGuidedTourPath(pathname: string) {
  return guidedTourPathMatchers.some((matcher) => matcher.test(pathname));
}

export function matchesGuidedTourStep(step: GuidedTourStep, pathname: string) {
  return typeof step.routeMatcher === 'function'
    ? step.routeMatcher(pathname)
    : step.routeMatcher.test(pathname);
}

export function requestGuidedTourOpen() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GUIDED_TOUR_OPEN_EVENT));
}

export const GUIDED_TOUR_STEPS: GuidedTourStep[] = [
  {
    id: 'navigation',
    title: 'Main navigation',
    description:
      'Use this header to move between Find Shifters, conversations, calendar, assistance, and your profile. You can also reopen this tour here whenever you need a quick refresher.',
    route: '/families/match',
    routeMatcher: isGuidedTourPath,
    selector: '[data-tour="families-nav"]',
    placement: 'bottom',
  },
  {
    id: 'discovery',
    title: 'Find compatible shifters',
    description:
      'Review profiles aligned with your location, schedule, and care needs. Each card helps you decide more clearly before sending a connection request.',
    route: '/families/match',
    routeMatcher: /^\/families\/match$/,
    selector: '[data-tour="match-feed"]',
    placement: 'bottom',
  },
  {
    id: 'match-actions',
    title: 'Choose how to move forward',
    description:
      'Use these actions to pass on a profile or show interest. This keeps your search focused and helps you follow up only with families that truly fit your needs.',
    route: '/families/match',
    routeMatcher: /^\/families\/match$/,
    selector: '[data-tour="match-actions"]',
    placement: 'top',
  },
  {
    id: 'matches',
    title: 'Track your matches',
    description:
      'This view helps you review pending requests, active connections, and quick links to profiles, chats, or agreed shifts. It acts as the control center for each relationship inside the platform.',
    route: '/families/matches',
    routeMatcher: /^\/families\/matches$/,
    selector: '[data-tour="matches-center"]',
    placement: 'bottom',
  },
  {
    id: 'messages',
    title: 'Message with confidence',
    description:
      'Once a match is confirmed, this space keeps your conversations organized and easier to manage. Use it to continue agreements before scheduling care.',
    route: '/families/messages',
    routeMatcher: /^\/families\/messages$/,
    selector: '[data-tour="messages-center"]',
    placement: 'bottom',
  },
  {
    id: 'calendar',
    title: 'Manage shifts and availability',
    description:
      'The calendar brings together proposals, approvals, changes, and upcoming arrangements with your matches. It gives you a clear view of what is already confirmed.',
    route: '/families/calendar',
    routeMatcher: /^\/families\/calendar$/,
    selector: '[data-tour="calendar-center"]',
    placement: 'bottom',
  },
  {
    id: 'profile',
    title: 'Keep your profile strong',
    description:
      'Other families use this space to get to know you better. Keeping it clear, current, and complete improves trust and the quality of the matches you receive.',
    route: '/families/profile',
    routeMatcher: (pathname) =>
      pathname === '/families/profile' ||
      (pathname !== '/families/profile/edit' && /^\/families\/profile\/[^/]+$/.test(pathname)),
    selector: '[data-tour="profile-overview"]',
    placement: 'bottom',
  },
  {
    id: 'verification',
    title: 'Verification updates',
    description:
      'Update your profile details here. Verification tools are coming soon, and your account stays active while that update is being prepared.',
    route: '/families/profile/edit',
    routeMatcher: /^\/families\/profile\/edit$/,
    selector: '[data-tour="profile-verification"]',
    placement: 'left',
  },
  {
    id: 'welcome',
    title: 'All set',
    description: 'All set. You can now start using the platform with confidence.',
    route: '/families/profile/edit',
    routeMatcher: /^\/families\/profile\/edit$/,
    placement: 'center',
  },
];
