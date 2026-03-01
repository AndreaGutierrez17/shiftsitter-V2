'use client'

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, X, RotateCcw, MapPin, ArrowRight, CalendarDays, Baby } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { UserProfile } from '@/lib/types';
import { calculateCompatibility } from '@/lib/match/calculateCompatibility';
import { db } from '@/lib/firebase/client';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import Link from 'next/link';
import { AuthGuard } from '@/components/AuthGuard';
import { useRouter } from 'next/navigation';

type FirestoreError = { code?: string; message?: string };

type GenericDoc = Record<string, unknown>;

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function buildLocation(city?: string, state?: string, zip?: string, fallback?: string) {
  const safeCity = asString(city).trim();
  const safeState = asString(state).trim();
  const safeZip = asString(zip).trim();
  if (safeCity && safeState && safeZip) return `${safeCity}, ${safeState} ${safeZip}`;
  if (safeCity && safeState) return `${safeCity}, ${safeState}`;
  return asString(fallback).trim();
}

function buildAvailabilitySummary(needDays: string[], needShifts: string[], giveDays: string[], giveShifts: string[]) {
  const parts = [
    needDays.length || needShifts.length
      ? `Need: ${[needDays.join(', '), needShifts.join(', ')].filter(Boolean).join(' | ')}`
      : '',
    giveDays.length || giveShifts.length
      ? `Gives: ${[giveDays.join(', '), giveShifts.join(', ')].filter(Boolean).join(' | ')}`
      : '',
  ].filter(Boolean);

  return parts.join('  •  ');
}

function normalizeFamilyRole(value: unknown): UserProfile['role'] {
  if (value === 'parent' || value === 'sitter' || value === 'reciprocal') return value;
  return 'reciprocal';
}

function normalizeFamilyState(value: unknown) {
  return asString(value).trim().toUpperCase();
}

function mergeCandidate(uid: string, publicProfile?: GenericDoc, legacyUser?: GenericDoc, answersDoc?: GenericDoc): UserProfile {
  const answers = ((answersDoc?.answers as GenericDoc | undefined) || {}) as GenericDoc;
  const legacyNeed = (typeof legacyUser?.need === 'object' && legacyUser?.need ? (legacyUser.need as GenericDoc) : undefined);
  const legacyOffer = (typeof legacyUser?.offer === 'object' && legacyUser?.offer ? (legacyUser.offer as GenericDoc) : undefined);
  const needDays = asStringArray(answers.need_days ?? legacyNeed?.days ?? legacyUser?.daysNeeded);
  const needShifts = asStringArray(answers.need_shifts ?? legacyNeed?.shifts ?? legacyUser?.shiftsNeeded);
  const giveDays = asStringArray(answers.give_days ?? legacyOffer?.days);
  const giveShifts = asStringArray(answers.give_shifts ?? legacyOffer?.shifts);
  const photoURLs = asStringArray(publicProfile?.photoURLs ?? legacyUser?.photoURLs);
  const primaryPhoto = asString(publicProfile?.photoURL ?? photoURLs[0]);
  const location = buildLocation(
    asString(publicProfile?.city ?? legacyUser?.city),
    asString(publicProfile?.state ?? legacyUser?.state),
    asString(publicProfile?.homeZip ?? legacyUser?.zip),
    asString(publicProfile?.location ?? legacyUser?.location)
  );
  const interests = asStringArray(answers.interests ?? legacyUser?.interests);

  return {
    id: uid,
    email: (legacyUser?.email as string | null | undefined) ?? null,
    accountType: 'family',
    name: asString(publicProfile?.displayName ?? legacyUser?.name) || 'Unnamed family',
    age: asNumber(legacyUser?.age, 18),
    role: normalizeFamilyRole(publicProfile?.familyRole ?? legacyUser?.role),
    location,
    state: asString(publicProfile?.state ?? legacyUser?.state),
    city: asString(publicProfile?.city ?? legacyUser?.city),
    zip: asString(publicProfile?.homeZip ?? legacyUser?.zip),
    numberOfChildren: asNumber(legacyUser?.numberOfChildren, 0) || undefined,
    childAge: typeof legacyUser?.childAge === 'number' ? (legacyUser.childAge as number) : undefined,
    childrenAgesText: asString(legacyUser?.childrenAgesText),
    availability:
      asString(legacyUser?.availability) ||
      buildAvailabilitySummary(needDays, needShifts, giveDays, giveShifts),
    needs: asString(legacyUser?.needs) || 'Open to coordinate care schedules.',
    offerSummary: asString(legacyUser?.offerSummary),
    interests,
    photoURLs: primaryPhoto ? [primaryPhoto, ...photoURLs.filter((url) => url !== primaryPhoto)] : photoURLs,
    workplace: asString(legacyUser?.workplace),
    daysNeeded: needDays,
    shiftsNeeded: needShifts,
    smokeFree: asBoolean(legacyUser?.smokeFree, asBoolean(answers.smoke_free)),
    petsOk: asBoolean(legacyUser?.petsOk, asBoolean(answers.okay_with_pets)),
    specialNeedsOk: asBoolean(legacyUser?.specialNeedsOk),
    need: {
      ...(legacyNeed || {}),
      days: needDays,
      shifts: needShifts as ('Early' | 'Day' | 'Evening' | 'Night')[],
      requireSmokeFree: asBoolean(answers.smoke_free_required, asBoolean(legacyNeed?.requireSmokeFree)),
      petsInHome: (asString(answers.pets_in_home || legacyNeed?.petsInHome) as never) || 'unknown',
      okWithPets: asBoolean(answers.okay_with_pets, asBoolean(legacyNeed?.okWithPets)),
      zipHome: asString(answers.home_zip ?? publicProfile?.homeZip ?? legacyUser?.zip),
      zipWork: asString(answers.work_zip ?? publicProfile?.workZip),
      handoffPreference: (asString(answers.handoff_need) as never) || (legacyNeed?.handoffPreference as never) || 'either',
      maxTravelMinutes: asNumber(answers.travel_max_minutes, asNumber(legacyNeed?.maxTravelMinutes, 30)),
      settingPreference: (asString(answers.setting_need) as never) || (legacyNeed?.settingPreference as never) || 'either',
      extrasNeeded: asStringArray(answers.extras_need ?? legacyNeed?.extrasNeeded),
    },
    offer: {
      ...(legacyOffer || {}),
      days: giveDays,
      shifts: giveShifts as ('Early' | 'Day' | 'Evening' | 'Night')[],
      zipHome: asString(answers.home_zip ?? publicProfile?.homeZip ?? legacyUser?.zip),
      zipWork: asString(answers.work_zip ?? publicProfile?.workZip),
      smokeFree: asBoolean(answers.smoke_free, asBoolean(legacyOffer?.smokeFree)),
      okWithPets: asBoolean(answers.okay_with_pets, asBoolean(legacyOffer?.okWithPets)),
      handoffPreference: (asString(answers.handoff_offer) as never) || (legacyOffer?.handoffPreference as never) || 'either',
      maxTravelMinutes: asNumber(answers.travel_max_minutes, asNumber(legacyOffer?.maxTravelMinutes, 30)),
      settingPreference: (asString(answers.setting_offer) as never) || (legacyOffer?.settingPreference as never) || 'either',
      extrasOffered: asStringArray(answers.extras_offer ?? legacyOffer?.extrasOffered),
    },
    backgroundCheckStatus: (legacyUser?.backgroundCheckStatus as UserProfile['backgroundCheckStatus']) || 'not_started',
    verificationStatus: (legacyUser?.verificationStatus as UserProfile['verificationStatus']) || 'unverified',
    profileComplete: Boolean(publicProfile?.onboardingComplete ?? legacyUser?.onboardingComplete ?? legacyUser?.profileComplete),
    isDemo: asBoolean(publicProfile?.isDemo, asBoolean(legacyUser?.isDemo)),
  };
}

const SwipeCard = ({
  userProfile,
  currentUserProfile,
  onSwipe,
  onOpenProfile,
}: {
  userProfile: UserProfile,
  currentUserProfile?: UserProfile | null,
  onSwipe: (id: string, direction: 'left' | 'right') => void,
  onOpenProfile: (id: string) => void,
}) => {
  const primaryPhoto = userProfile.photoURLs?.[0] || '';
  const fallbackPhoto = '/ShiftSitter.jpeg';
  const avatarLikePhoto = /dicebear|ui-avatars|robohash|avatar|initial|placeholder|profile-default|\.svg/i.test(primaryPhoto);
  const preferredPhoto = primaryPhoto && !avatarLikePhoto ? primaryPhoto : fallbackPhoto;
  const [imageSrc, setImageSrc] = useState(preferredPhoto);
  const needsText = userProfile.needs || userProfile.workplace || 'Open to coordinate care schedules.';
  const { totalScore, breakdown, distanceKm, strengths } = calculateCompatibility(currentUserProfile ?? undefined, userProfile);
  const isVerified = userProfile.verificationStatus === 'verified';
  const matchTier = totalScore >= 85 ? 'Ideal Match' : totalScore >= 65 ? 'Good Match' : 'Maybe Match';

  useEffect(() => {
    setImageSrc(preferredPhoto);
  }, [preferredPhoto]);

  const barWidth = (value: number) => `${Math.max(0, Math.min(100, value))}%`;

  return (
    <motion.div
      key={userProfile.id}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(e, { offset, velocity }) => {
        const swipe = Math.abs(offset.x) * velocity.x;
        if (swipe < -10000) {
          onSwipe(userProfile.id, 'left');
        } else if (swipe > 10000) {
          onSwipe(userProfile.id, 'right');
        }
      }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 300, opacity: 0, scale: 0.8 }}
      transition={{ ease: 'easeInOut' }}
      className="relative w-full"
    >
      <Card
        className="relative w-full min-h-[820px] md:min-h-[900px] rounded-2xl overflow-hidden shadow-lg cursor-pointer"
        onClick={() => onOpenProfile(userProfile.id)}
      >
        <img
          src={imageSrc}
          alt={userProfile.name || 'Profile picture'}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => {
            if (imageSrc !== fallbackPhoto) setImageSrc(fallbackPhoto);
          }}
        />
        <div className="absolute inset-0 match-hero-overlay p-5">
          <div className="match-hero-top">
            {typeof distanceKm === 'number' ? (
              <div
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/90 px-4 py-2 text-sm font-semibold text-[var(--navy)] shadow-sm"
                onClick={(event) => event.stopPropagation()}
              >
                <MapPin className="h-5 w-5" />
                <span>{distanceKm} km away</span>
              </div>
            ) : (
              <button type="button" className="match-hero-icon ghost" onClick={(event) => event.stopPropagation()}>
                <MapPin className="h-5 w-5" />
              </button>
            )}
            <Link
              href={`/families/profile/${userProfile.id}`}
              onClick={(event) => event.stopPropagation()}
              className="match-hero-icon"
            >
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
          <div className="match-hero-content">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  isVerified
                    ? 'border-emerald-200 bg-emerald-50/95 text-emerald-700'
                    : 'border-amber-200 bg-amber-50/95 text-amber-700'
                }`}
              >
                {isVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>
            <h2 className="match-hero-name">{userProfile.name}, {userProfile.age}</h2>
            <p className="match-hero-location"><MapPin size={16} /> {userProfile.location || 'Location unavailable'}</p>
            <div className="match-hero-meta">
              {typeof userProfile.childAge === 'number' && (
                <p><Baby size={16} /> <span>Child&apos;s Age</span> {userProfile.childAge} years old</p>
              )}
              {userProfile.availability && (
                <p><CalendarDays size={16} /> <span>Availability</span> {userProfile.availability}</p>
              )}
              <p className="match-hero-needs-row"><Heart size={16} /> <span>Needs</span> {needsText}</p>
            </div>
            {Array.isArray(userProfile.interests) && userProfile.interests.length > 0 && (
              <div className="match-chip-row">
                {userProfile.interests.slice(0, 3).map((interest) => (
                  <span key={interest} className="match-chip">{interest}</span>
                ))}
              </div>
            )}
            <div className="mt-3 rounded-xl border border-white/20 bg-[rgba(28,33,44,.58)] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                  {totalScore}% Match
                </div>
                <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90">
                  {matchTier}
                </div>
              </div>
              <div className="space-y-2 text-xs text-white/90">
                {[
                  ['Location', breakdown.location],
                  ['Availability', breakdown.availability],
                  ['Needs & Values', breakdown.needsValues],
                  ['Preferences', breakdown.preferences],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <div className="mb-1 flex items-center justify-between">
                      <span>{label}</span>
                      <span className="text-white/75">{value}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-1.5 rounded-full bg-emerald-300"
                        style={{ width: barWidth(Number(value)) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {strengths.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {strengths.slice(0, 3).map((strength) => (
                    <span key={strength} className="match-chip">{strength}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default function MatchPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLikeId, setSavingLikeId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [noProfilesMessage, setNoProfilesMessage] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    if (!user) {
      setProfiles([]);
      setCurrentUserProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadDiscovery = async () => {
      setLoading(true);
      setNoProfilesMessage(null);

      try {
        const [
          currentProfileSnap,
          currentLegacySnap,
          currentAnswersSnap,
          profileCandidatesSnap,
          legacyCandidatesSnap,
          outgoingRequestsSnap,
          incomingRequestsSnap,
          activeMatchesSnap,
        ] = await Promise.all([
          getDoc(doc(db, 'profiles', user.uid)),
          getDoc(doc(db, 'users', user.uid)),
          getDoc(doc(db, 'user_answers', user.uid)),
          getDocs(query(collection(db, 'profiles'), where('role', '==', 'family'), where('onboardingComplete', '==', true), limit(80))),
          getDocs(query(collection(db, 'users'), where('profileComplete', '==', true), limit(80))),
          getDocs(query(collection(db, 'match_requests'), where('fromUid', '==', user.uid))),
          getDocs(query(collection(db, 'match_requests'), where('toUid', '==', user.uid))),
          getDocs(query(collection(db, 'matches'), where('userIds', 'array-contains', user.uid))),
        ]);

        const currentMerged = mergeCandidate(
          user.uid,
          currentProfileSnap.exists() ? (currentProfileSnap.data() as GenericDoc) : undefined,
          currentLegacySnap.exists() ? (currentLegacySnap.data() as GenericDoc) : undefined,
          currentAnswersSnap.exists() ? (currentAnswersSnap.data() as GenericDoc) : undefined
        );

        const isCurrentUserReady = Boolean(
          currentMerged.profileComplete ||
          currentProfileSnap.data()?.onboardingComplete ||
          currentLegacySnap.data()?.profileComplete
        );

        if (!isCurrentUserReady) {
          router.replace('/families/onboarding');
          return;
        }

        const requestHiddenIds = new Set<string>();
        outgoingRequestsSnap.docs.forEach((row) => {
          const data = row.data() as { toUid?: string; status?: string };
          if (data.toUid && data.status !== 'declined') requestHiddenIds.add(data.toUid);
        });
        incomingRequestsSnap.docs.forEach((row) => {
          const data = row.data() as { fromUid?: string; status?: string };
          if (data.fromUid && data.status === 'pending') requestHiddenIds.add(data.fromUid);
        });

        const matchedIds = new Set<string>();
        activeMatchesSnap.docs.forEach((row) => {
          const data = row.data() as { userIds?: string[]; uids?: string[] };
          const ids = Array.isArray(data.userIds) ? data.userIds : Array.isArray(data.uids) ? data.uids : [];
          ids.filter((id) => id !== user.uid).forEach((id) => matchedIds.add(id));
        });

        const legacyUsersById = new Map<string, GenericDoc>();
        legacyCandidatesSnap.docs.forEach((row) => {
          const data = row.data() as GenericDoc;
          const accountType = asString(data.accountType);
          const role = asString(data.role);
          const isFamilyRecord = accountType === 'family' || ['parent', 'sitter', 'reciprocal'].includes(role);
          if (!isFamilyRecord) return;
          legacyUsersById.set(row.id, data);
        });

        const publicProfilesById = new Map<string, GenericDoc>();
        profileCandidatesSnap.docs.forEach((row) => {
          publicProfilesById.set(row.id, row.data() as GenericDoc);
        });

        const candidateIds = Array.from(new Set([...publicProfilesById.keys(), ...legacyUsersById.keys()]))
          .filter((candidateId) => candidateId !== user.uid)
          .filter((candidateId) => !requestHiddenIds.has(candidateId))
          .filter((candidateId) => !matchedIds.has(candidateId));

        const viewerState = normalizeFamilyState(currentMerged.state);

        const mergedProfiles = candidateIds
          .map((candidateId) =>
            mergeCandidate(
              candidateId,
              publicProfilesById.get(candidateId),
              legacyUsersById.get(candidateId),
              undefined
            )
          )
          .filter((profile) => profile.profileComplete)
          .filter((profile) => !profile.isDemo)
          .filter((profile) => {
            const candidateState = normalizeFamilyState(profile.state);
            if (!viewerState || !candidateState) return true;
            return viewerState === candidateState;
          })
          .map((profile) => ({
            profile,
            compatibility: calculateCompatibility(currentMerged, profile),
          }))
          .sort((a, b) => b.compatibility.totalScore - a.compatibility.totalScore)
          .map((entry) => entry.profile)
          .slice(0, 10);

        if (cancelled) return;

        setCurrentUserProfile(currentMerged);
        setProfiles(mergedProfiles);
        setCurrentIndex(0);

        if (mergedProfiles.length === 0) {
          setNoProfilesMessage({
            title: 'No family profiles available right now',
            description: 'Try Refine Match Search after updating onboarding answers, or wait for more families to complete onboarding.',
          });
        }
      } catch (error: unknown) {
        const firestoreError = error as FirestoreError;
        console.error('Families discovery query failed:', firestoreError.code, firestoreError.message ?? error);
        if (cancelled) return;
        setProfiles([]);
        setNoProfilesMessage({
          title: 'Error loading match feed',
          description: 'Firestore could not return discovery profiles. Check rules/permissions in the browser console.',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDiscovery();

    return () => {
      cancelled = true;
    };
  }, [refreshNonce, router, user]);

  const currentProfile = useMemo(() => profiles[currentIndex] ?? null, [currentIndex, profiles]);

  const removeCurrentProfile = () => {
    if (!currentProfile) return;
    const nextLength = profiles.length - 1;
    setProfiles((previous) => previous.filter((profile) => profile.id !== currentProfile.id));
    setCurrentIndex((previous) => {
      if (nextLength <= 0) return 0;
      return previous >= nextLength ? nextLength - 1 : previous;
    });
  };

  const handlePass = (swipedUserId: string) => {
    if (!currentProfile || currentProfile.id !== swipedUserId) return;
    removeCurrentProfile();
  };

  const handleLike = async (swipedUserId: string) => {
    if (!user || !currentProfile || currentProfile.id !== swipedUserId || savingLikeId) return;

    setSavingLikeId(swipedUserId);
    try {
      const requestRef = await addDoc(collection(db, 'match_requests'), {
        fromUid: user.uid,
        toUid: swipedUserId,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      try {
        const idToken = await user.getIdToken();
        await fetch('/api/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            type: 'request',
            notificationId: `match_request_${requestRef.id}_${swipedUserId}`,
            targetUserIds: [swipedUserId],
            title: 'New Match Request',
            body: `${currentUserProfile?.name || user.displayName || 'A family'} wants to match with you.`,
            link: '/families/matches',
            data: {
              requestId: requestRef.id,
              fromUid: user.uid,
            },
          }),
        });
      } catch (notifyError) {
        console.error('Could not send match request notification:', notifyError);
      }

      removeCurrentProfile();
    } catch (error: unknown) {
      const firestoreError = error as FirestoreError;
      console.error('Could not create match request:', firestoreError.code, firestoreError.message ?? error);
      setNoProfilesMessage({
        title: 'Could not send match request',
        description: 'The request write failed. Check Firestore permissions and try again.',
      });
    } finally {
      setSavingLikeId(null);
    }
  };

  const handleBackProfile = () => {
    setCurrentIndex((previous) => Math.max(0, previous - 1));
  };

  const handleNextProfile = () => {
    setCurrentIndex((previous) => {
      if (profiles.length === 0) return 0;
      return Math.min(profiles.length - 1, previous + 1);
    });
  };

  const handleSwipe = (swipedUserId: string, direction: 'left' | 'right') => {
    if (direction === 'left') {
      handlePass(swipedUserId);
      return;
    }
    void handleLike(swipedUserId);
  };

  const refreshProfiles = () => {
    setRefreshNonce((value) => value + 1);
  };

  const handleOpenProfile = (profileId: string) => {
    router.push(`/families/profile/${profileId}`);
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="match-shell">
        <div className="match-inner">
          <div className="mb-4 flex justify-end">
            <button type="button" className="match-btn match-refine-btn" onClick={refreshProfiles}>
              <RotateCcw className="h-4 w-4" />
              Refine Match Search
            </button>
          </div>
          <div className="match-deck-wrap">
            <AnimatePresence>
              {currentProfile ? (
                <SwipeCard
                  key={currentProfile.id}
                  userProfile={currentProfile}
                  currentUserProfile={currentUserProfile}
                  onSwipe={handleSwipe}
                  onOpenProfile={handleOpenProfile}
                />
              ) : (
                !loading && noProfilesMessage && (
                  <Card className="match-card w-full">
                    <CardContent className="match-foot text-center">
                      <h3 className="match-title">{noProfilesMessage.title}</h3>
                      <p className="text-muted-foreground mt-2">{noProfilesMessage.description}</p>
                      <button type="button" className="match-btn match-refine-btn mt-3" onClick={refreshProfiles}>
                        <RotateCcw className="h-4 w-4" />
                        Refine Match Search
                      </button>
                    </CardContent>
                  </Card>
                )
              )}
            </AnimatePresence>
          </div>
          <div className="match-action-row">
            <button
              type="button"
              className="match-nav-btn"
              onClick={handleBackProfile}
              disabled={loading || currentIndex <= 0 || Boolean(savingLikeId)}
            >
              Regresar
            </button>
            <button
              type="button"
              className="match-action-btn pass"
              onClick={() => currentProfile && handlePass(currentProfile.id)}
              disabled={!currentProfile || loading || Boolean(savingLikeId)}
            >
              <X className="h-8 w-8" />
            </button>
            <button
              type="button"
              className="match-action-btn like"
              onClick={() => currentProfile && handleLike(currentProfile.id)}
              disabled={!currentProfile || loading || Boolean(savingLikeId)}
            >
              <Heart className="h-8 w-8" />
            </button>
            <button
              type="button"
              className="match-nav-btn"
              onClick={handleNextProfile}
              disabled={!currentProfile || loading || Boolean(savingLikeId) || currentIndex >= profiles.length - 1}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
