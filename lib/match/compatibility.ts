import type { UserProfile } from '@/lib/types';

export type CompatibilityResult = {
  total: number | null;
  breakdown: {
    distance: number | null;
    schedule: number | null;
    safety: number | null;
    kids: number | null;
    handoff: number | null;
  };
  status: 'PENDING_DATA';
};

export function getCompatibility(
  currentUser: UserProfile | null | undefined,
  candidate: UserProfile | null | undefined
): CompatibilityResult {
  void currentUser;
  void candidate;

  return {
    total: null,
    breakdown: {
      distance: null,
      schedule: null,
      safety: null,
      kids: null,
      handoff: null,
    },
    status: 'PENDING_DATA',
  };
}
