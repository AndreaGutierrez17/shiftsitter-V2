import type { UserProfile } from '@/lib/types';

type ShiftBlock = 'Early' | 'Day' | 'Evening' | 'Night';
type HandoffPreference = 'pickup' | 'dropoff' | 'my_workplace' | 'their_workplace' | 'either';
type SettingPreference = 'my_home' | 'their_home' | 'either';
type PetsInHome = 'none' | 'dog' | 'cat' | 'multiple' | 'unknown';

type NeedOfferShape = {
  days?: string[];
  shifts?: string[];
  childrenCount?: number;
  maxChildrenTotal?: number;
  smokeFree?: boolean;
  requireSmokeFree?: boolean;
  petsInHome?: PetsInHome;
  okWithPets?: boolean;
  handoffPreference?: HandoffPreference;
  maxTravelMinutes?: number;
  settingPreference?: SettingPreference;
  childrenAges?: number[];
  ageRanges?: string[];
  extrasNeeded?: string[];
  extrasOffered?: string[];
  zipHome?: string;
  zipWork?: string;
};

type AnswersShape = {
  need_days?: string[];
  need_shifts?: string[];
  give_days?: string[];
  give_shifts?: string[];
  extras_need?: string[];
  extras_offer?: string[];
  smoke_free_required?: boolean;
  smoke_free?: boolean;
  pets_in_home?: PetsInHome;
  okay_with_pets?: boolean;
  setting_need?: SettingPreference;
  setting_offer?: SettingPreference;
  handoff_need?: HandoffPreference;
  handoff_offer?: HandoffPreference;
  travel_max_minutes?: number;
  home_zip?: string;
  work_zip?: string;
  interests?: string[];
};

type MatchProfile = UserProfile & {
  daysNeeded?: string[];
  shiftsNeeded?: string[];
  scheduleDays?: string[];
  scheduleShifts?: string[];
  handoffPreference?: HandoffPreference;
  settingPreference?: SettingPreference;
  maxTravelMinutes?: number;
  zip?: string;
  zipHome?: string;
  zipWork?: string;
  childrenAges?: number[];
  ageRanges?: string[];
  extrasNeeded?: string[];
  extrasOffered?: string[];
  need?: NeedOfferShape;
  offer?: NeedOfferShape;
  state?: string;
  answers?: AnswersShape;
};

export const COMPATIBILITY_WEIGHTS = {
  location: 0.3,
  availability: 0.3,
  needsValues: 0.25,
  preferences: 0.15,
} as const;

type DimensionKey = keyof typeof COMPATIBILITY_WEIGHTS;

type DetailedBreakdownItem = {
  label: string;
  key: DimensionKey;
  score: number;
  weight: number;
  weightedContribution: number;
};

export type CompatibilityCalculationResult = {
  totalScore: number;
  hardFilterPassed: boolean;
  hardFilterFailures: string[];
  distanceKm: number | null;
  estimatedTravelMinutes: number | null;
  breakdown: {
    location: number;
    availability: number;
    needsValues: number;
    preferences: number;
    schedule: number;
    distance: number;
    safety: number;
    kids: number;
    handoff: number;
  };
  dimensions10: Record<DimensionKey, number>;
  detailedBreakdown: DetailedBreakdownItem[];
  strengths: string[];
};

const DEFAULT_RESULT: CompatibilityCalculationResult = {
  totalScore: 0,
  hardFilterPassed: false,
  hardFilterFailures: ['Missing profile data'],
  distanceKm: null,
  estimatedTravelMinutes: null,
  breakdown: {
    location: 0,
    availability: 0,
    needsValues: 0,
    preferences: 0,
    schedule: 0,
    distance: 0,
    safety: 0,
    kids: 0,
    handoff: 0,
  },
  dimensions10: {
    location: 0,
    availability: 0,
    needsValues: 0,
    preferences: 0,
  },
  detailedBreakdown: [],
  strengths: [],
};

function clamp(num: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num));
}

function normalizeList(values?: string[]) {
  return (values || []).map((value) => String(value).trim()).filter(Boolean);
}

function overlapPercent(a?: string[], b?: string[]) {
  const left = normalizeList(a);
  const right = normalizeList(b);
  if (left.length === 0 && right.length === 0) return 60;
  if (left.length === 0 || right.length === 0) return 45;

  const rightSet = new Set(right);
  const intersection = left.filter((value) => rightSet.has(value)).length;
  const base = Math.max(left.length, right.length) || 1;
  return clamp(Math.round((intersection / base) * 100));
}

function averagePercent(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function normalizeState(value?: string) {
  const state = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : state;
}

function sameState(a?: string, b?: string) {
  const left = normalizeState(a);
  const right = normalizeState(b);
  if (!left || !right) return null;
  return left === right;
}

function deriveNeed(profile: MatchProfile): NeedOfferShape {
  const answers = profile.answers;
  return {
    days: normalizeList(answers?.need_days ?? profile.need?.days ?? profile.daysNeeded ?? profile.scheduleDays),
    shifts: normalizeList(answers?.need_shifts ?? profile.need?.shifts ?? profile.shiftsNeeded ?? profile.scheduleShifts),
    childrenCount: profile.need?.childrenCount ?? profile.numberOfChildren ?? 0,
    childrenAges: profile.need?.childrenAges ?? profile.childrenAges,
    smokeFree: profile.need?.smokeFree ?? profile.smokeFree,
    requireSmokeFree: answers?.smoke_free_required ?? profile.need?.requireSmokeFree ?? profile.smokeFree,
    petsInHome: answers?.pets_in_home ?? profile.need?.petsInHome ?? 'unknown',
    okWithPets: answers?.okay_with_pets ?? profile.need?.okWithPets ?? profile.petsOk,
    handoffPreference: answers?.handoff_need ?? profile.need?.handoffPreference ?? profile.handoffPreference ?? 'either',
    maxTravelMinutes: answers?.travel_max_minutes ?? profile.need?.maxTravelMinutes ?? profile.maxTravelMinutes,
    settingPreference: answers?.setting_need ?? profile.need?.settingPreference ?? profile.settingPreference ?? 'either',
    zipHome: answers?.home_zip ?? profile.need?.zipHome ?? profile.zipHome ?? profile.zip,
    zipWork: answers?.work_zip ?? profile.need?.zipWork ?? profile.zipWork,
    extrasNeeded: answers?.extras_need ?? profile.need?.extrasNeeded ?? profile.extrasNeeded ?? [],
  };
}

function deriveOffer(profile: MatchProfile): NeedOfferShape {
  const answers = profile.answers;
  return {
    days: normalizeList(answers?.give_days ?? profile.offer?.days ?? profile.daysNeeded ?? profile.scheduleDays),
    shifts: normalizeList(answers?.give_shifts ?? profile.offer?.shifts ?? profile.shiftsNeeded ?? profile.scheduleShifts),
    maxChildrenTotal: profile.offer?.maxChildrenTotal,
    ageRanges: profile.offer?.ageRanges ?? profile.ageRanges,
    smokeFree: answers?.smoke_free ?? profile.offer?.smokeFree ?? profile.smokeFree,
    okWithPets: answers?.okay_with_pets ?? profile.offer?.okWithPets ?? profile.petsOk,
    handoffPreference: answers?.handoff_offer ?? profile.offer?.handoffPreference ?? profile.handoffPreference ?? 'either',
    maxTravelMinutes: answers?.travel_max_minutes ?? profile.offer?.maxTravelMinutes ?? profile.maxTravelMinutes,
    settingPreference: answers?.setting_offer ?? profile.offer?.settingPreference ?? profile.settingPreference ?? 'either',
    zipHome: answers?.home_zip ?? profile.offer?.zipHome ?? profile.zipHome ?? profile.zip,
    zipWork: answers?.work_zip ?? profile.offer?.zipWork ?? profile.zipWork,
    extrasOffered: answers?.extras_offer ?? profile.offer?.extrasOffered ?? profile.extrasOffered ?? [],
  };
}

function estimateTravel(currentUser: MatchProfile, candidate: MatchProfile, myNeed: NeedOfferShape, candidateOffer: NeedOfferShape) {
  const zipA = myNeed.zipHome || myNeed.zipWork || currentUser.zip;
  const zipB = candidateOffer.zipHome || candidateOffer.zipWork || candidate.zip;
  const stateMatch = sameState(currentUser.state, candidate.state);

  if (zipA && zipB && zipA === zipB) {
    return { minutes: 10, distanceKm: 3, locationScore: 100 };
  }
  if (stateMatch === true) {
    return { minutes: 25, distanceKm: 24, locationScore: zipA && zipB ? 72 : 60 };
  }
  if (stateMatch === false) {
    return { minutes: 45, distanceKm: 80, locationScore: 25 };
  }

  if (zipA || zipB) {
    return { minutes: 30, distanceKm: 32, locationScore: 45 };
  }

  return { minutes: null, distanceKm: null, locationScore: 45 };
}

function settingCompatible(needSetting?: SettingPreference, offerSetting?: SettingPreference) {
  const need = needSetting ?? 'either';
  const offer = offerSetting ?? 'either';
  if (need === 'either' || offer === 'either') return true;
  if (need === 'my_home' && offer === 'their_home') return true;
  if (need === 'their_home' && offer === 'my_home') return true;
  return need === offer;
}

function smokeCompatibility(myNeed: NeedOfferShape, candidateOffer: NeedOfferShape) {
  if (!myNeed.requireSmokeFree) return typeof candidateOffer.smokeFree === 'boolean' ? 80 : 70;
  return candidateOffer.smokeFree === false ? 0 : 100;
}

function petsCompatibility(myNeed: NeedOfferShape, candidateNeed: NeedOfferShape) {
  if (myNeed.okWithPets !== false) return 75;
  const petsInHome = candidateNeed.petsInHome;
  if (!petsInHome || petsInHome === 'none' || petsInHome === 'unknown') return 100;
  return 0;
}

function settingCompatibility(myNeed: NeedOfferShape, candidateOffer: NeedOfferShape) {
  return settingCompatible(myNeed.settingPreference, candidateOffer.settingPreference) ? 100 : 20;
}

function travelCompatibility(estimatedMinutes: number | null, myNeed: NeedOfferShape, candidateOffer: NeedOfferShape) {
  if (estimatedMinutes == null) return 70;

  const limits = [myNeed.maxTravelMinutes, candidateOffer.maxTravelMinutes].filter(
    (value): value is number => typeof value === 'number' && value > 0
  );
  if (limits.length === 0) return 70;

  const withinCount = limits.filter((limit) => estimatedMinutes <= limit).length;
  if (withinCount === limits.length) return 100;
  if (withinCount > 0) return 65;
  return 25;
}

function strengthLabel(key: DimensionKey) {
  if (key === 'location') return 'Location alignment';
  if (key === 'availability') return 'Availability overlap';
  if (key === 'needsValues') return 'Needs and values fit';
  return 'Preference compatibility';
}

export function calculateCompatibility(
  currentUser: MatchProfile | null | undefined,
  candidate: MatchProfile | null | undefined
): CompatibilityCalculationResult {
  if (!currentUser || !candidate) return DEFAULT_RESULT;

  const myNeed = deriveNeed(currentUser);
  const myOffer = deriveOffer(currentUser);
  const candidateNeed = deriveNeed(candidate);
  const candidateOffer = deriveOffer(candidate);

  const travelEstimate = estimateTravel(currentUser, candidate, myNeed, candidateOffer);

  const forwardDayOverlap = overlapPercent(myNeed.days, candidateOffer.days);
  const forwardShiftOverlap = overlapPercent(myNeed.shifts, candidateOffer.shifts);
  const reverseDayOverlap = overlapPercent(candidateNeed.days, myOffer.days);
  const reverseShiftOverlap = overlapPercent(candidateNeed.shifts, myOffer.shifts);

  const availabilityScore = averagePercent([
    averagePercent([forwardDayOverlap, forwardShiftOverlap]),
    averagePercent([reverseDayOverlap, reverseShiftOverlap]),
  ]);

  const extrasForward = overlapPercent(myNeed.extrasNeeded, candidateOffer.extrasOffered);
  const extrasReverse = overlapPercent(candidateNeed.extrasNeeded, myOffer.extrasOffered);
  const valuesOverlap = overlapPercent(
    currentUser.answers?.interests ?? currentUser.interests,
    candidate.answers?.interests ?? candidate.interests
  );

  const needsValuesScore = averagePercent([extrasForward, extrasReverse, valuesOverlap]);

  const preferencesScore = averagePercent([
    smokeCompatibility(myNeed, candidateOffer),
    petsCompatibility(myNeed, candidateNeed),
    settingCompatibility(myNeed, candidateOffer),
    travelCompatibility(travelEstimate.minutes, myNeed, candidateOffer),
  ]);

  const locationScore = travelEstimate.locationScore;

  const weightedLocation = locationScore * COMPATIBILITY_WEIGHTS.location;
  const weightedAvailability = availabilityScore * COMPATIBILITY_WEIGHTS.availability;
  const weightedNeedsValues = needsValuesScore * COMPATIBILITY_WEIGHTS.needsValues;
  const weightedPreferences = preferencesScore * COMPATIBILITY_WEIGHTS.preferences;

  const totalScore = Math.round(
    clamp(weightedLocation + weightedAvailability + weightedNeedsValues + weightedPreferences)
  );

  const detailedBreakdown: DetailedBreakdownItem[] = [
    {
      key: 'location',
      label: 'Location',
      score: locationScore,
      weight: COMPATIBILITY_WEIGHTS.location,
      weightedContribution: Math.round(weightedLocation * 100) / 100,
    },
    {
      key: 'availability',
      label: 'Availability',
      score: availabilityScore,
      weight: COMPATIBILITY_WEIGHTS.availability,
      weightedContribution: Math.round(weightedAvailability * 100) / 100,
    },
    {
      key: 'needsValues',
      label: 'Needs & Values',
      score: needsValuesScore,
      weight: COMPATIBILITY_WEIGHTS.needsValues,
      weightedContribution: Math.round(weightedNeedsValues * 100) / 100,
    },
    {
      key: 'preferences',
      label: 'Preferences',
      score: preferencesScore,
      weight: COMPATIBILITY_WEIGHTS.preferences,
      weightedContribution: Math.round(weightedPreferences * 100) / 100,
    },
  ];

  const strengths = detailedBreakdown
    .filter((item) => item.score >= 60)
    .sort((a, b) => b.weightedContribution - a.weightedContribution)
    .slice(0, 3)
    .map((item) => strengthLabel(item.key));

  return {
    totalScore,
    hardFilterPassed: true,
    hardFilterFailures: [],
    distanceKm: travelEstimate.distanceKm,
    estimatedTravelMinutes: travelEstimate.minutes,
    breakdown: {
      location: locationScore,
      availability: availabilityScore,
      needsValues: needsValuesScore,
      preferences: preferencesScore,
      schedule: availabilityScore,
      distance: locationScore,
      safety: needsValuesScore,
      kids: preferencesScore,
      handoff: preferencesScore,
    },
    dimensions10: {
      location: Math.round(locationScore / 10),
      availability: Math.round(availabilityScore / 10),
      needsValues: Math.round(needsValuesScore / 10),
      preferences: Math.round(preferencesScore / 10),
    },
    detailedBreakdown,
    strengths,
  };
}
