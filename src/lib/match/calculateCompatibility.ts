import type { UserProfile } from '@/lib/types';

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
  handoffPreference?: 'pickup' | 'dropoff' | 'either';
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  zip?: string;
};

export function calculateCompatibility(currentUser: MatchProfile | null | undefined, candidate: MatchProfile | null | undefined) {
  let score = 0;

  const weights = {
    schedule: 30,
    distance: 20,
    safety: 15,
    kids: 20,
    handoff: 15,
  } as const;

  const breakdown = {
    schedule: 0,
    distance: 0,
    safety: 0,
    kids: 0,
    handoff: 0,
  };

  if (!currentUser || !candidate) {
    return { totalScore: 0, breakdown };
  }

  const getScheduleDays = (p: MatchProfile) => p.scheduleDays ?? p.daysNeeded ?? [];
  const getScheduleShifts = (p: MatchProfile) => p.scheduleShifts ?? p.shiftsNeeded ?? [];

  const toSet = (values: string[]) => new Set(values.filter(Boolean));
  const overlapPercent = (a: string[], b: string[]) => {
    const setA = toSet(a);
    const setB = toSet(b);
    if (setA.size === 0 || setB.size === 0) return 50;
    let intersection = 0;
    setA.forEach((value) => {
      if (setB.has(value)) intersection += 1;
    });
    const union = new Set([...setA, ...setB]).size || 1;
    return Math.round((intersection / union) * 100);
  };

  const daysScore = overlapPercent(getScheduleDays(currentUser), getScheduleDays(candidate));
  const shiftsScore = overlapPercent(getScheduleShifts(currentUser), getScheduleShifts(candidate));
  breakdown.schedule = Math.round(daysScore * 0.6 + shiftsScore * 0.4);

  const haversineMiles = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const aa =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa)));
  };

  if (
    typeof currentUser.latitude === 'number' &&
    typeof currentUser.longitude === 'number' &&
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number'
  ) {
    const miles = haversineMiles(currentUser.latitude, currentUser.longitude, candidate.latitude, candidate.longitude);
    const radiusA = typeof currentUser.travelRadiusMiles === 'number' ? currentUser.travelRadiusMiles : 15;
    const radiusB = typeof candidate.travelRadiusMiles === 'number' ? candidate.travelRadiusMiles : 15;
    const combined = Math.max(5, radiusA + radiusB);
    breakdown.distance = miles <= combined ? 100 : Math.max(0, Math.round(100 - ((miles - combined) / combined) * 100));
  } else if (currentUser.zip && candidate.zip) {
    breakdown.distance = currentUser.zip === candidate.zip ? 100 : currentUser.state && candidate.state && currentUser.state === candidate.state ? 70 : 40;
  } else if (currentUser.state && candidate.state) {
    breakdown.distance = currentUser.state === candidate.state ? 65 : 35;
  } else {
    breakdown.distance = 50;
  }

  const safetyPairs: Array<[boolean | undefined, boolean | undefined]> = [
    [currentUser.smokeFree, candidate.smokeFree],
    [currentUser.petsOk, candidate.petsOk],
    [currentUser.specialNeedsOk, candidate.specialNeedsOk],
  ];
  const safetyKnown = safetyPairs.filter(([a, b]) => typeof a === 'boolean' && typeof b === 'boolean');
  breakdown.safety =
    safetyKnown.length === 0
      ? 50
      : Math.round(
          (safetyKnown.filter(([a, b]) => a === b).length / safetyKnown.length) * 100
        );

  const requiredChildren = typeof currentUser.numberOfChildren === 'number' ? currentUser.numberOfChildren : 0;
  if (typeof candidate.kidsCapacity === 'number') {
    if (requiredChildren <= 0) {
      breakdown.kids = 80;
    } else if (candidate.kidsCapacity >= requiredChildren) {
      breakdown.kids = 100;
    } else {
      breakdown.kids = Math.max(0, Math.round((candidate.kidsCapacity / requiredChildren) * 100));
    }
  } else {
    breakdown.kids = requiredChildren > 0 ? 50 : 70;
  }

  const aHandoff = currentUser.handoffPreference ?? 'either';
  const bHandoff = candidate.handoffPreference ?? 'either';
  if (aHandoff === 'either' || bHandoff === 'either') {
    breakdown.handoff = 85;
  } else {
    breakdown.handoff = aHandoff === bHandoff ? 100 : 40;
  }

  score += (breakdown.schedule / 100) * weights.schedule;
  score += (breakdown.distance / 100) * weights.distance;
  score += (breakdown.safety / 100) * weights.safety;
  score += (breakdown.kids / 100) * weights.kids;
  score += (breakdown.handoff / 100) * weights.handoff;

  return {
    totalScore: Math.max(0, Math.min(100, Math.round(score))),
    breakdown,
  };
}
