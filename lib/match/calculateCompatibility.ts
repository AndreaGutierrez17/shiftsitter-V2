import type { UserProfile } from '@/lib/types';

type ShiftBlock = 'Early' | 'Day' | 'Evening' | 'Night';
type HandoffPreference = 'pickup' | 'dropoff' | 'either';
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
  specialNeeds?: { has?: boolean; notes?: string };
  okWithSpecialNeeds?: boolean;
  zipHome?: string;
  zipWork?: string;
};

type MatchProfile = UserProfile & {
  daysNeeded?: string[];
  shiftsNeeded?: string[];
  scheduleDays?: string[];
  scheduleShifts?: string[];
  travelRadiusMiles?: number;
  smokeFree?: boolean;
  petsOk?: boolean;
  specialNeedsOk?: boolean;
  kidsCapacity?: number;
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
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
};

export const COMPATIBILITY_WEIGHTS = {
  schedule: 0.25,
  distance: 0.2,
  safety: 0.15,
  capacity: 0.1,
  handoff: 0.1,
  age: 0.1,
  reciprocity: 0.05,
  extras: 0.05,
} as const;

type DimensionKey = keyof typeof COMPATIBILITY_WEIGHTS;

type DetailedBreakdownItem = {
  label: string;
  key: DimensionKey;
  score10: number;
  weight: number;
  normalizedContribution: number;
};

export type CompatibilityCalculationResult = {
  totalScore: number;
  hardFilterPassed: boolean;
  hardFilterFailures: string[];
  breakdown: {
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
  breakdown: { schedule: 0, distance: 0, safety: 0, kids: 0, handoff: 0 },
  dimensions10: {
    schedule: 0,
    distance: 0,
    safety: 0,
    capacity: 0,
    handoff: 0,
    age: 0,
    reciprocity: 0,
    extras: 0,
  },
  detailedBreakdown: [],
  strengths: [],
};

const SCHEDULE_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHIFT_LABELS: ShiftBlock[] = ['Early', 'Day', 'Evening', 'Night'];

function clamp(num: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, num));
}

function normalizeList(values?: string[]) {
  return (values || []).map((v) => String(v).trim()).filter(Boolean);
}

function setIntersectionCount(a: string[], b: string[]) {
  const setB = new Set(b);
  return a.filter((v) => setB.has(v)).length;
}

function jaccardScore10(a: string[], b: string[]) {
  if (a.length === 0 && b.length === 0) return 5;
  if (a.length === 0 || b.length === 0) return 3;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  setA.forEach((value) => {
    if (setB.has(value)) intersection += 1;
  });
  const union = new Set([...setA, ...setB]).size || 1;
  return clamp(Math.round((intersection / union) * 10));
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function parseAgeTokensFromText(text?: string) {
  if (!text) return [] as number[];
  return text
    .split(/[,/; ]+/)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

function parseAgeRange(range: string): [number, number] | null {
  const cleaned = range.toLowerCase().trim();
  if (!cleaned) return null;
  if (/infant/.test(cleaned)) return [0, 2];
  if (/toddler/.test(cleaned)) return [1, 4];
  const plus = cleaned.match(/(\d+)\s*\+/);
  if (plus) return [Number(plus[1]), 99];
  const span = cleaned.match(/(\d+)\s*[-to]+\s*(\d+)/);
  if (span) return [Number(span[1]), Number(span[2])];
  const single = cleaned.match(/(\d+)/);
  if (single) {
    const n = Number(single[1]);
    return [n, n];
  }
  return null;
}

function anyAgeFitsRange(ages: number[], ranges: string[]) {
  if (ages.length === 0 || ranges.length === 0) return null;
  const parsedRanges = ranges.map(parseAgeRange).filter((r): r is [number, number] => !!r);
  if (parsedRanges.length === 0) return null;
  let matches = 0;
  ages.forEach((age) => {
    if (parsedRanges.some(([min, max]) => age >= min && age <= max)) matches += 1;
  });
  return matches / ages.length;
}

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa)));
}

function deriveNeed(profile: MatchProfile): NeedOfferShape {
  const childrenAges = profile.childrenAges ?? parseAgeTokensFromText(profile.childrenAgesText);
  return {
    days: normalizeList(profile.need?.days ?? profile.daysNeeded ?? profile.scheduleDays),
    shifts: normalizeList(profile.need?.shifts ?? profile.shiftsNeeded ?? profile.scheduleShifts),
    childrenCount: profile.need?.childrenCount ?? profile.numberOfChildren ?? 0,
    childrenAges: profile.need?.childrenAges ?? childrenAges,
    smokeFree: profile.need?.smokeFree ?? profile.smokeFree,
    requireSmokeFree: profile.need?.requireSmokeFree ?? profile.smokeFree,
    petsInHome: profile.need?.petsInHome ?? 'unknown',
    okWithPets: profile.need?.okWithPets ?? profile.petsOk,
    handoffPreference: profile.need?.handoffPreference ?? profile.handoffPreference ?? 'either',
    maxTravelMinutes: profile.need?.maxTravelMinutes ?? profile.maxTravelMinutes,
    settingPreference: profile.need?.settingPreference ?? profile.settingPreference ?? 'either',
    zipHome: profile.need?.zipHome ?? profile.zip,
    zipWork: profile.need?.zipWork,
    extrasNeeded: profile.need?.extrasNeeded ?? [],
    specialNeeds: profile.need?.specialNeeds ?? { has: false },
  };
}

function deriveOffer(profile: MatchProfile): NeedOfferShape {
  return {
    days: normalizeList(profile.offer?.days ?? profile.daysNeeded ?? profile.scheduleDays),
    shifts: normalizeList(profile.offer?.shifts ?? profile.shiftsNeeded ?? profile.scheduleShifts),
    maxChildrenTotal: profile.offer?.maxChildrenTotal ?? profile.kidsCapacity ?? (profile.role === 'sitter' ? 2 : profile.numberOfChildren ?? 2),
    ageRanges: profile.offer?.ageRanges ?? profile.ageRanges ?? [],
    smokeFree: profile.offer?.smokeFree ?? profile.smokeFree,
    okWithPets: profile.offer?.okWithPets ?? profile.petsOk,
    handoffPreference: profile.offer?.handoffPreference ?? profile.handoffPreference ?? 'either',
    maxTravelMinutes: profile.offer?.maxTravelMinutes ?? profile.maxTravelMinutes,
    settingPreference: profile.offer?.settingPreference ?? profile.settingPreference ?? 'either',
    zipHome: profile.offer?.zipHome ?? profile.zip,
    zipWork: profile.offer?.zipWork,
    extrasOffered: profile.offer?.extrasOffered ?? [],
    okWithSpecialNeeds: profile.offer?.okWithSpecialNeeds ?? profile.specialNeedsOk,
  };
}

function settingCompatible(needSetting?: SettingPreference, offerSetting?: SettingPreference) {
  const a = needSetting ?? 'either';
  const b = offerSetting ?? 'either';
  if (a === 'either' || b === 'either') return true;
  if (a === 'my_home' && b === 'their_home') return true;
  if (a === 'their_home' && b === 'my_home') return true;
  return a === b;
}

function handoffCompatible(needHandoff?: HandoffPreference, offerHandoff?: HandoffPreference) {
  const a = needHandoff ?? 'either';
  const b = offerHandoff ?? 'either';
  if (a === 'either' || b === 'either') return true;
  return a === b;
}

function travelHardFilterAndScore10(currentUser: MatchProfile, candidate: MatchProfile, need: NeedOfferShape, offer: NeedOfferShape) {
  const targetMinutes = need.maxTravelMinutes ?? 30;
  let estimatedMinutes: number | null = null;

  if (
    typeof currentUser.latitude === 'number' &&
    typeof currentUser.longitude === 'number' &&
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number'
  ) {
    const miles = haversineMiles(currentUser.latitude, currentUser.longitude, candidate.latitude, candidate.longitude);
    estimatedMinutes = miles * 2.2; // coarse suburban driving heuristic for MVP
  } else {
    const zipA = need.zipHome || need.zipWork || currentUser.zip;
    const zipB = offer.zipHome || offer.zipWork || candidate.zip;
    if (zipA && zipB) {
      if (zipA === zipB) estimatedMinutes = 10;
      else if (currentUser.state && candidate.state && currentUser.state === candidate.state) estimatedMinutes = 25;
      else estimatedMinutes = 55;
    } else if (currentUser.state && candidate.state) {
      estimatedMinutes = currentUser.state === candidate.state ? 35 : 75;
    }
  }

  if (estimatedMinutes == null) return { pass: true, score10: 5, reason: null as string | null };
  if (estimatedMinutes > targetMinutes) {
    return { pass: false, score10: 0, reason: 'Travel distance exceeds max travel time' };
  }

  const ratio = targetMinutes <= 0 ? 1 : estimatedMinutes / targetMinutes;
  const score10 = clamp(Math.round((1 - ratio) * 8 + 2));
  return { pass: true, score10, reason: null as string | null };
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

  const hardFilterFailures: string[] = [];

  const scheduleDaysA = normalizeList(myNeed.days);
  const scheduleShiftsA = normalizeList(myNeed.shifts);
  const scheduleDaysB = normalizeList(candidateOffer.days);
  const scheduleShiftsB = normalizeList(candidateOffer.shifts);

  const dayOverlapCount = setIntersectionCount(scheduleDaysA, scheduleDaysB);
  const shiftOverlapCount = setIntersectionCount(scheduleShiftsA, scheduleShiftsB);

  if (scheduleDaysA.length && scheduleDaysB.length && dayOverlapCount < 1) {
    hardFilterFailures.push('No overlapping days');
  }
  if (scheduleShiftsA.length && scheduleShiftsB.length && shiftOverlapCount < 1) {
    hardFilterFailures.push('No overlapping shift blocks');
  }

  const travelCheck = travelHardFilterAndScore10(currentUser, candidate, myNeed, candidateOffer);
  if (!travelCheck.pass) hardFilterFailures.push(travelCheck.reason!);

  if (!handoffCompatible(myNeed.handoffPreference, candidateOffer.handoffPreference)) {
    hardFilterFailures.push('Handoff preference mismatch');
  }

  if (!settingCompatible(myNeed.settingPreference, candidateOffer.settingPreference)) {
    hardFilterFailures.push('Setting preference mismatch');
  }

  if (myNeed.requireSmokeFree && candidateOffer.smokeFree === false) {
    hardFilterFailures.push('Smoke-free requirement mismatch');
  }

  if (myNeed.okWithPets === false && (candidateNeed.petsInHome && candidateNeed.petsInHome !== 'none' && candidateNeed.petsInHome !== 'unknown')) {
    hardFilterFailures.push('Pet compatibility mismatch');
  }

  if (myNeed.specialNeeds?.has && candidateOffer.okWithSpecialNeeds === false) {
    hardFilterFailures.push('Special-needs support mismatch');
  }

  const childrenCount = myNeed.childrenCount ?? 0;
  const capacity = candidateOffer.maxChildrenTotal;
  if (typeof capacity === 'number' && childrenCount > capacity) {
    hardFilterFailures.push('Children count exceeds offered capacity');
  }

  const hardFilterPassed = hardFilterFailures.length === 0;

  const scheduleFit10 = clamp(Math.round(avg([
    jaccardScore10(scheduleDaysA, scheduleDaysB),
    jaccardScore10(scheduleShiftsA, scheduleShiftsB),
  ])));

  const distanceFit10 = travelCheck.score10;

  const safetySignals: number[] = [];
  if (myNeed.requireSmokeFree) safetySignals.push(candidateOffer.smokeFree ? 10 : 0);
  else if (typeof candidateOffer.smokeFree === 'boolean') safetySignals.push(candidateOffer.smokeFree ? 8 : 6);
  if (myNeed.okWithPets === false) {
    const noPets = !candidateNeed.petsInHome || candidateNeed.petsInHome === 'none' || candidateNeed.petsInHome === 'unknown';
    safetySignals.push(noPets ? 10 : 0);
  } else if (typeof candidateOffer.okWithPets === 'boolean') {
    safetySignals.push(candidateOffer.okWithPets ? 8 : 5);
  }
  if (myNeed.specialNeeds?.has) {
    safetySignals.push(candidateOffer.okWithSpecialNeeds ? 10 : 0);
  }
  const safetyFit10 = clamp(Math.round(safetySignals.length ? avg(safetySignals) : 6));

  let capacityFit10 = 6;
  if (typeof capacity === 'number') {
    if (childrenCount <= 0) capacityFit10 = 8;
    else if (capacity >= childrenCount) {
      capacityFit10 = clamp(Math.round(8 + Math.min(2, (capacity - childrenCount) * 0.5)));
    } else {
      capacityFit10 = 0;
    }
  }

  const handoffFit10 = handoffCompatible(myNeed.handoffPreference, candidateOffer.handoffPreference)
    ? ((myNeed.handoffPreference === 'either' || candidateOffer.handoffPreference === 'either') ? 8 : 10)
    : 0;

  const ageMatchRatio = anyAgeFitsRange(myNeed.childrenAges || [], candidateOffer.ageRanges || []);
  const ageFit10 = ageMatchRatio == null ? 5 : clamp(Math.round(ageMatchRatio * 10));

  const myExtrasNeeded = normalizeList(myNeed.extrasNeeded);
  const candidateExtrasOffered = normalizeList(candidateOffer.extrasOffered);
  const extrasFit10 = clamp(Math.round(jaccardScore10(myExtrasNeeded, candidateExtrasOffered)));

  const reverseDayFit = jaccardScore10(normalizeList(candidateNeed.days), normalizeList(myOffer.days));
  const reverseShiftFit = jaccardScore10(normalizeList(candidateNeed.shifts), normalizeList(myOffer.shifts));
  const reciprocityBalanceFit10 = clamp(Math.round(avg([reverseDayFit, reverseShiftFit])));

  const dimensions10: Record<DimensionKey, number> = {
    schedule: scheduleFit10,
    distance: distanceFit10,
    safety: safetyFit10,
    capacity: capacityFit10,
    handoff: handoffFit10,
    age: ageFit10,
    reciprocity: reciprocityBalanceFit10,
    extras: extrasFit10,
  };

  const detailedBreakdown: DetailedBreakdownItem[] = [
    { key: 'schedule', label: 'Schedule overlap', score10: dimensions10.schedule, weight: COMPATIBILITY_WEIGHTS.schedule, normalizedContribution: 0 },
    { key: 'distance', label: 'Distance / travel', score10: dimensions10.distance, weight: COMPATIBILITY_WEIGHTS.distance, normalizedContribution: 0 },
    { key: 'safety', label: 'Safety alignment', score10: dimensions10.safety, weight: COMPATIBILITY_WEIGHTS.safety, normalizedContribution: 0 },
    { key: 'capacity', label: 'Kids capacity', score10: dimensions10.capacity, weight: COMPATIBILITY_WEIGHTS.capacity, normalizedContribution: 0 },
    { key: 'handoff', label: 'Handoff / pickup', score10: dimensions10.handoff, weight: COMPATIBILITY_WEIGHTS.handoff, normalizedContribution: 0 },
    { key: 'age', label: 'Age fit', score10: dimensions10.age, weight: COMPATIBILITY_WEIGHTS.age, normalizedContribution: 0 },
    { key: 'reciprocity', label: 'Reciprocity balance', score10: dimensions10.reciprocity, weight: COMPATIBILITY_WEIGHTS.reciprocity, normalizedContribution: 0 },
    { key: 'extras', label: 'Extras fit', score10: dimensions10.extras, weight: COMPATIBILITY_WEIGHTS.extras, normalizedContribution: 0 },
  ];

  let weightedTotal = 0;
  for (const item of detailedBreakdown) {
    const contribution = (item.score10 / 10) * item.weight * 100;
    item.normalizedContribution = Math.round(contribution * 100) / 100;
    weightedTotal += contribution;
  }

  const totalScore = hardFilterPassed ? Math.round(clamp(weightedTotal, 0, 100)) : 0;

  const strengths = detailedBreakdown
    .filter((item) => item.score10 >= 7)
    .sort((a, b) => b.normalizedContribution - a.normalizedContribution)
    .slice(0, 3)
    .map((item) => {
      if (item.key === 'schedule') return 'Great shift overlap';
      if (item.key === 'distance') return 'Close proximity';
      if (item.key === 'safety') return 'Safety aligned';
      if (item.key === 'capacity') return 'Kids capacity fit';
      if (item.key === 'handoff') return 'Pickup/handoff aligned';
      if (item.key === 'age') return 'Good age-range fit';
      if (item.key === 'reciprocity') return 'Balanced exchange potential';
      return 'Helpful extras match';
    });

  return {
    totalScore,
    hardFilterPassed,
    hardFilterFailures,
    breakdown: {
      schedule: Math.round((dimensions10.schedule / 10) * 100),
      distance: Math.round((dimensions10.distance / 10) * 100),
      safety: Math.round((dimensions10.safety / 10) * 100),
      kids: Math.round((dimensions10.capacity / 10) * 100),
      handoff: Math.round((dimensions10.handoff / 10) * 100),
    },
    dimensions10,
    detailedBreakdown,
    strengths,
  };
}
